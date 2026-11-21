-- Explicitly test-only. No restore endpoint and no grants on application/Auth tables.
begin;
alter table clinical_private.audit_events drop constraint audit_events_action_check;
alter table clinical_private.audit_events add constraint audit_events_action_check check (
  action in ('patient.list','patient.read','patient.create','patient.update','patient.archive','backup.export')
);

create function clinical_private.clinical_backup_seed_test() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); first_id uuid; second_id uuid; n integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('backup-test-fixture:'||actor::text,0));
  select count(*) into n from clinical_private.patients where clinician_id=actor;
  if n > 0 then
    if n=2 and not exists (select 1 from clinical_private.patients where clinician_id=actor
      and (payload->>'fixture' is distinct from 'backup-roundtrip-v1' or payload->'testOnly' is distinct from 'true'::jsonb))
      then return jsonb_build_object('patients',2,'already_present',true); end if;
    raise exception 'La prueba requiere una cuenta sin otros pacientes' using errcode='22023';
  end if;
  first_id := (clinical_private.clinical_patient_create('{"name":"FICTICIO · Prueba de copia A","testOnly":true,"fixture":"backup-roundtrip-v1","history":"Historia ficticia inicial"}'::jsonb)->>'id')::uuid;
  perform clinical_private.clinical_patient_save(first_id,1,'{"name":"FICTICIO · Prueba de copia A","testOnly":true,"fixture":"backup-roundtrip-v1","history":"Historia ficticia revisada · recuperación 🧪","treatment":{"passive":"Movilización ficticia","exercises":["Isométrico de cuádriceps"]}}'::jsonb);
  second_id := (clinical_private.clinical_patient_create('{"name":"FICTICIO · Prueba de copia B archivado","testOnly":true,"fixture":"backup-roundtrip-v1","history":"Ejemplo ficticio archivado"}'::jsonb)->>'id')::uuid;
  perform clinical_private.clinical_patient_archive(second_id,1);
  return jsonb_build_object('patients',2,'already_present',false);
end;
$$;
revoke all on function clinical_private.clinical_backup_seed_test() from public,anon;
grant execute on function clinical_private.clinical_backup_seed_test() to authenticated;

create function clinical_private.clinical_backup_export_test() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician(); snapshot jsonb;
begin
  if (select count(*) from clinical_private.patients where clinician_id=actor)<>2 or exists (
    select 1 from clinical_private.patients where clinician_id=actor and
      (payload->>'fixture' is distinct from 'backup-roundtrip-v1' or payload->'testOnly' is distinct from 'true'::jsonb)
  ) then raise exception 'Solo se permite el conjunto ficticio de esta prueba' using errcode='22023'; end if;
  if (select count(*) from clinical_private.patient_versions v join clinical_private.patients p on p.id=v.patient_id where p.clinician_id=actor)>5000
    or (select count(*) from clinical_private.audit_events where actor_id=actor)>9999
    or (select coalesce(sum(octet_length(v.payload::text)),0) from clinical_private.patient_versions v join clinical_private.patients p on p.id=v.patient_id where p.clinician_id=actor)>2097152
    then raise exception 'La copia supera los límites de la prueba; no se ha recortado' using errcode='54000'; end if;
  insert into clinical_private.audit_events(actor_id,action) values(actor,'backup.export');
  -- One SELECT provides one MVCC read snapshot for all three collections, including this export event.
  select jsonb_build_object(
    'format','mlrehab-clinical-test-snapshot','version',1,'test_only',true,'clinician_id',actor,
    'created_at',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'patients',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'clinician_id',p.clinician_id,'payload_json',p.payload::text,'revision',p.revision,
      'created_at',to_char(p.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'updated_at',to_char(p.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'archived_at',to_char(p.archived_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by p.id),'[]'::jsonb)
      from clinical_private.patients p where p.clinician_id=actor),
    'patient_versions',(select coalesce(jsonb_agg(jsonb_build_object(
      'patient_id',v.patient_id,'revision',v.revision,'payload_json',v.payload::text,'archived',v.archived,
      'created_at',to_char(v.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by v.patient_id,v.revision),'[]'::jsonb)
      from clinical_private.patient_versions v join clinical_private.patients p on p.id=v.patient_id where p.clinician_id=actor),
    'audit_events',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id::text,'actor_id',e.actor_id,'patient_id',e.patient_id,'action',e.action,'revision',e.revision,
      'created_at',to_char(e.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by e.id),'[]'::jsonb)
      from clinical_private.audit_events e where e.actor_id=actor)
  ) into snapshot;
  if octet_length(snapshot::text)>4194304 then raise exception 'Copia demasiado grande; no se ha recortado' using errcode='54000'; end if;
  return snapshot;
end;
$$;
revoke all on function clinical_private.clinical_backup_export_test() from public,anon;
grant execute on function clinical_private.clinical_backup_export_test() to authenticated;

create function public.clinical_backup_seed_test() returns jsonb
language sql volatile security invoker set search_path=pg_catalog
as $$ select clinical_private.clinical_backup_seed_test() $$;
create function public.clinical_backup_export_test() returns jsonb
language sql volatile security invoker set search_path=pg_catalog
as $$ select clinical_private.clinical_backup_export_test() $$;
revoke all on function public.clinical_backup_seed_test() from public,anon;
revoke all on function public.clinical_backup_export_test() from public,anon;
grant execute on function public.clinical_backup_seed_test() to authenticated;
grant execute on function public.clinical_backup_export_test() to authenticated;
commit;
