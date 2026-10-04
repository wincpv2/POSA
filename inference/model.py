from __future__ import annotations

from pathlib import Path

import numpy as np
import torch
from torch import nn


SAMPLE_RATE_HZ = 100
WINDOW_SECONDS = 60
WINDOW_SAMPLES = SAMPLE_RATE_HZ * WINDOW_SECONDS
APNEA_THRESHOLD = 0.5


class SEBlock1D(nn.Module):
    def __init__(self, channels: int, reduction: int = 16) -> None:
        super().__init__()
        self.fc = nn.Sequential(
            nn.Linear(channels, channels // reduction, bias=False),
            nn.ReLU(inplace=True),
            nn.Linear(channels // reduction, channels, bias=False),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch, channels, _ = x.size()
        scale = self.fc(torch.mean(x, dim=2)).view(batch, channels, 1)
        return x * scale.expand_as(x)


class SEBottleneck1D(nn.Module):
    expansion = 4

    def __init__(self, in_planes: int, planes: int, stride: int = 1) -> None:
        super().__init__()
        self.conv1 = nn.Conv1d(in_planes, planes, kernel_size=1, bias=False)
        self.bn1 = nn.BatchNorm1d(planes)
        self.conv2 = nn.Conv1d(planes, planes, kernel_size=7, stride=stride, padding=3, bias=False)
        self.bn2 = nn.BatchNorm1d(planes)
        self.conv3 = nn.Conv1d(planes, self.expansion * planes, kernel_size=1, bias=False)
        self.bn3 = nn.BatchNorm1d(self.expansion * planes)
        self.relu = nn.ReLU(inplace=True)
        self.se = SEBlock1D(self.expansion * planes)
        self.shortcut = nn.Sequential()
        if stride != 1 or in_planes != self.expansion * planes:
            self.shortcut = nn.Sequential(
                nn.Conv1d(in_planes, self.expansion * planes, kernel_size=1, stride=stride, bias=False),
                nn.BatchNorm1d(self.expansion * planes),
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.relu(self.bn2(self.conv2(out)))
        out = self.bn3(self.conv3(out))
        out = self.se(out)
        return self.relu(out + self.shortcut(x))


class SEResNet50_1D(nn.Module):
    def __init__(self, num_classes: int = 1) -> None:
        super().__init__()
        self.in_planes = 64
        self.stem = nn.Sequential(
            nn.Conv1d(1, 64, kernel_size=15, stride=2, padding=7, bias=False),
            nn.BatchNorm1d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool1d(kernel_size=3, stride=2, padding=1),
        )
        self.layer1 = self._make_layer(64, 3, stride=1)
        self.layer2 = self._make_layer(128, 4, stride=2)
        self.layer3 = self._make_layer(256, 6, stride=2)
        self.layer4 = self._make_layer(512, 3, stride=2)
        self.pool = nn.AdaptiveAvgPool1d(1)
        self.dropout = nn.Dropout(0.3)
        self.fc = nn.Linear(512 * SEBottleneck1D.expansion, num_classes)

    def _make_layer(self, planes: int, blocks: int, stride: int) -> nn.Sequential:
        strides = [stride] + [1] * (blocks - 1)
        layers = []
        for layer_stride in strides:
            layers.append(SEBottleneck1D(self.in_planes, planes, layer_stride))
            self.in_planes = planes * SEBottleneck1D.expansion
        return nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.stem(x)
        x = self.layer1(x)
        x = self.layer2(x)
        x = self.layer3(x)
        x = self.layer4(x)
        x = self.pool(x).squeeze(-1)
        return self.fc(self.dropout(x)).squeeze(1)


def preprocess_signal(signal: np.ndarray) -> np.ndarray:
    """Match the training notebook: first channel, 60 s, 100 Hz, z-score, clip."""
    if signal.ndim == 2:
        signal = signal[:, 0]
    if signal.ndim != 1:
        raise ValueError("Expected a single ECG channel.")

    minutes = len(signal) // WINDOW_SAMPLES
    if minutes == 0:
        raise ValueError("Recording must contain at least one complete 60-second window.")

    windows = []
    for index in range(minutes):
        segment = np.nan_to_num(
            signal[index * WINDOW_SAMPLES : (index + 1) * WINDOW_SAMPLES],
            nan=0.0,
            posinf=0.0,
            neginf=0.0,
        ).astype(np.float32, copy=False)
        mean = float(np.mean(segment))
        std = float(np.std(segment))
        normalized = (segment - mean) / std if std > 1e-4 else segment - mean
        windows.append(np.clip(normalized, -5.0, 5.0))
    return np.stack(windows)


def load_model(path: str | Path) -> tuple[SEResNet50_1D, torch.device]:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    # The user's trusted Colab checkpoint stores NumPy metric scalars alongside
    # the state dict, which PyTorch's restricted weights-only loader rejects.
    checkpoint = torch.load(Path(path), map_location="cpu", weights_only=False)
    if not isinstance(checkpoint, dict) or "model_state_dict" not in checkpoint:
        raise ValueError("Checkpoint must contain a model_state_dict entry.")
    model = SEResNet50_1D()
    model.load_state_dict(checkpoint["model_state_dict"])
    del checkpoint
    model = model.to(device)
    model.eval()
    return model, device


def predict_minutes(
    model: SEResNet50_1D,
    device: torch.device,
    windows: np.ndarray,
    batch_size: int = 32,
) -> list[float]:
    probabilities: list[float] = []
    with torch.inference_mode():
        for start in range(0, len(windows), batch_size):
            batch = torch.from_numpy(windows[start : start + batch_size]).unsqueeze(1).to(device)
            logits = model(batch)
            probabilities.extend(torch.sigmoid(logits).detach().cpu().tolist())
    return probabilities
