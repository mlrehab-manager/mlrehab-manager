-- Test-only patient editing. No changes to Auth, RLS grants or existing payload fields.
begin;
create function clinical_private.clinical_patient_list_test() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); result jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name','revision',revision,'archived',archived_at is not null) order by archived_at is not null,id),'[]'::jsonb)
    into result from (select * from clinical_private.patients where clinician_id=actor
      and payload->'testOnly'='true'::jsonb and payload->>'fixture'='backup-roundtrip-v1'
      order by archived_at is not null,id limit 50) as visible;
  insert into clinical_private.audit_events(actor_id,action) values(actor,'patient.list');
  return result;
end;
$$;
revoke all on function clinical_private.clinical_patient_list_test() from public,anon;
grant execute on function clinical_private.clinical_patient_list_test() to authenticated;

create function clinical_private.clinical_patient_save_fields_test(p_id uuid,p_expected_revision integer,p_fields jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); saved clinical_private.patients; field_name text; max_length integer;
begin
  if p_fields is null or jsonb_typeof(p_fields)<>'object' or p_fields='{}'::jsonb then
    raise exception 'Campos de prueba no válidos' using errcode='22023'; end if;
  for field_name in select jsonb_object_keys(p_fields) loop
    if field_name not in ('history','exam','diagnosis','goals') then
      raise exception 'Campo no editable en esta prueba' using errcode='22023'; end if;
    max_length := case when field_name in ('history','exam') then 8000 else 2000 end;
    if jsonb_typeof(p_fields->field_name)<>'string' or char_length(p_fields->>field_name)>max_length then
      raise exception 'Campo de prueba no válido o demasiado largo' using errcode='22023'; end if;
  end loop;
  select * into saved from clinical_private.patients where id=p_id and clinician_id=actor
    and payload->'testOnly'='true'::jsonb and payload->>'fixture'='backup-roundtrip-v1' for update;
  if not found or saved.archived_at is not null or saved.revision is distinct from p_expected_revision then
    raise exception 'Versión antigua o registro no disponible' using errcode='40001'; end if;
  -- Merge inside PostgreSQL: unknown fields and numeric precision never round-trip through JS.
  return clinical_private.clinical_patient_save(p_id,p_expected_revision,saved.payload||p_fields);
end;
$$;
revoke all on function clinical_private.clinical_patient_save_fields_test(uuid,integer,jsonb) from public,anon;
grant execute on function clinical_private.clinical_patient_save_fields_test(uuid,integer,jsonb) to authenticated;

create function public.clinical_patient_list_test() returns jsonb
language sql volatile security invoker set search_path=pg_catalog
as $$ select clinical_private.clinical_patient_list_test() $$;
create function public.clinical_patient_save_fields_test(p_id uuid,p_expected_revision integer,p_fields jsonb) returns jsonb
language sql volatile security invoker set search_path=pg_catalog
as $$ select clinical_private.clinical_patient_save_fields_test(p_id,p_expected_revision,p_fields) $$;
revoke all on function public.clinical_patient_list_test() from public,anon;
revoke all on function public.clinical_patient_save_fields_test(uuid,integer,jsonb) from public,anon;
grant execute on function public.clinical_patient_list_test() to authenticated;
grant execute on function public.clinical_patient_save_fields_test(uuid,integer,jsonb) to authenticated;
commit;
