begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","app_metadata":{"provider":"email"}}';
select ok(public.is_google_clinician(), 'An email account can access clinician studies');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","app_metadata":{"providers":["email"]}}';
select ok(public.is_google_clinician(), 'The providers list can identify an email account');

set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa","app_metadata":{"provider":"google"}}';
select ok(not public.is_google_clinician(), 'The old OAuth provider does not grant clinician access');

set local request.jwt.claims = '{"app_metadata":{"provider":"email"}}';
select ok(not public.is_google_clinician(), 'An email claim without an account does not grant access');

reset role;
select * from finish();
rollback;
