-- Keep privileged implementations outside the HTTP-exposed schema.
-- Public invoker wrappers retain the same API and all private implementations retain auth/MFA/owner checks.
begin;
alter function public.clinical_patient_create(jsonb) set schema clinical_private;
alter function public.clinical_patient_get(uuid) set schema clinical_private;
alter function public.clinical_patient_list(uuid,integer) set schema clinical_private;
alter function public.clinical_patient_save(uuid,integer,jsonb) set schema clinical_private;
alter function public.clinical_patient_archive(uuid,integer) set schema clinical_private;
-- Namespace usage permits invoking the guarded functions; it does not grant table access.
grant usage on schema clinical_private to authenticated;

create function public.clinical_patient_create(p_payload jsonb) returns jsonb
language sql volatile security invoker set search_path = pg_catalog
as $$ select clinical_private.clinical_patient_create(p_payload) $$;
create function public.clinical_patient_get(p_id uuid) returns jsonb
language sql volatile security invoker set search_path = pg_catalog
as $$ select clinical_private.clinical_patient_get(p_id) $$;
create function public.clinical_patient_list(p_after uuid default null,p_limit integer default 20) returns jsonb
language sql volatile security invoker set search_path = pg_catalog
as $$ select clinical_private.clinical_patient_list(p_after,p_limit) $$;
create function public.clinical_patient_save(p_id uuid,p_expected_revision integer,p_payload jsonb) returns jsonb
language sql volatile security invoker set search_path = pg_catalog
as $$ select clinical_private.clinical_patient_save(p_id,p_expected_revision,p_payload) $$;
create function public.clinical_patient_archive(p_id uuid,p_expected_revision integer) returns jsonb
language sql volatile security invoker set search_path = pg_catalog
as $$ select clinical_private.clinical_patient_archive(p_id,p_expected_revision) $$;
revoke all on function public.clinical_patient_create(jsonb) from public,anon;
revoke all on function public.clinical_patient_get(uuid) from public,anon;
revoke all on function public.clinical_patient_list(uuid,integer) from public,anon;
revoke all on function public.clinical_patient_save(uuid,integer,jsonb) from public,anon;
revoke all on function public.clinical_patient_archive(uuid,integer) from public,anon;
grant execute on function public.clinical_patient_create(jsonb) to authenticated;
grant execute on function public.clinical_patient_get(uuid) to authenticated;
grant execute on function public.clinical_patient_list(uuid,integer) to authenticated;
grant execute on function public.clinical_patient_save(uuid,integer,jsonb) to authenticated;
grant execute on function public.clinical_patient_archive(uuid,integer) to authenticated;

-- Explicit restrictive denial also survives an accidental permissive policy for a client role.
create policy deny_direct_clients on clinical_private.authorized_clinicians as restrictive for all to anon,authenticated using(false) with check(false);
create policy deny_direct_clients on clinical_private.patients as restrictive for all to anon,authenticated using(false) with check(false);
create policy deny_direct_clients on clinical_private.patient_versions as restrictive for all to anon,authenticated using(false) with check(false);
create policy deny_direct_clients on clinical_private.audit_events as restrictive for all to anon,authenticated using(false) with check(false);
commit;
