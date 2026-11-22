-- Operational declarations only: no files, phrases, patient contents or activation.
begin;
create table clinical_private.backup_checks (
  id uuid primary key,
  clinician_id uuid not null references auth.users(id),
  data_mode text not null check (data_mode in ('test','clinical')),
  details jsonb not null,
  exported_at timestamptz not null,
  checked_at timestamptz not null default statement_timestamp()
);
create index backup_checks_owner_date on clinical_private.backup_checks(clinician_id, data_mode, checked_at desc, id);
alter table clinical_private.backup_checks enable row level security;
create policy deny_clients on clinical_private.backup_checks as restrictive for all to anon,authenticated using(false) with check(false);
revoke all on clinical_private.backup_checks from public,anon,authenticated;

create function clinical_private.clinical_backup_check_record(p_details jsonb, p_request_id uuid)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid := clinical_private.require_clinician();
  mode text := (select data_mode from clinical_private.authorized_clinicians where user_id=actor);
  export_time timestamptz; saved clinical_private.backup_checks;
begin
  if p_request_id is null or p_details is null or jsonb_typeof(p_details)<>'object'
    or (select count(*) from jsonb_object_keys(p_details))<>7
    or exists(select 1 from jsonb_object_keys(p_details) k where k not in ('version','export_event_id','encrypted_sha256','location','independent_copy','phrase_separate','verified_elsewhere'))
    or p_details->'version' is distinct from to_jsonb(case when mode='clinical' then 6 else 5 end)
    or jsonb_typeof(p_details->'export_event_id') is distinct from 'string' or p_details->>'export_event_id' !~ '^[1-9][0-9]{0,18}$'
    or jsonb_typeof(p_details->'encrypted_sha256') is distinct from 'string' or p_details->>'encrypted_sha256' !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_details->'location') is distinct from 'string' or p_details->>'location' not in ('this_device','icloud_drive','computer','disconnected_drive')
    or jsonb_typeof(p_details->'independent_copy') is distinct from 'boolean'
    or jsonb_typeof(p_details->'phrase_separate') is distinct from 'boolean'
    or jsonb_typeof(p_details->'verified_elsewhere') is distinct from 'boolean'
  then raise exception 'Comprobación no válida' using errcode='22023';end if;
  -- Compare text to avoid accepting overflow, fractional or floating-point event identifiers.
  select created_at into export_time from clinical_private.audit_events
    where actor_id=actor and action='backup.export' and id::text=p_details->>'export_event_id';
  if not found then raise exception 'Exportación no disponible para esta cuenta' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('backup-check:'||actor::text,0));
  select * into saved from clinical_private.backup_checks where id=p_request_id;
  if found then
    if saved.clinician_id<>actor then raise exception 'Petición no disponible' using errcode='42501';end if;
    if saved.data_mode<>mode or saved.details is distinct from p_details then raise exception 'La petición ya se utilizó con otra comprobación' using errcode='40001';end if;
  else
    insert into clinical_private.backup_checks(id,clinician_id,data_mode,details,exported_at)
      values(p_request_id,actor,mode,p_details,export_time) returning * into saved;
  end if;
  return jsonb_build_object('id',saved.id,'data_mode',saved.data_mode,'details',saved.details,'exported_at',clinical_private.backup_time(saved.exported_at),'checked_at',clinical_private.backup_time(saved.checked_at));
end;$$;
revoke all on function clinical_private.clinical_backup_check_record(jsonb,uuid) from public,anon;
grant execute on function clinical_private.clinical_backup_check_record(jsonb,uuid) to authenticated;
create function public.clinical_backup_check_record(p_details jsonb,p_request_id uuid)
returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_backup_check_record(p_details,p_request_id)$$;
revoke all on function public.clinical_backup_check_record(jsonb,uuid) from public,anon;
grant execute on function public.clinical_backup_check_record(jsonb,uuid) to authenticated;

create function clinical_private.clinical_backup_check_status() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();result jsonb;
begin
 select jsonb_build_object('id',id,'data_mode',data_mode,'details',details,'exported_at',clinical_private.backup_time(exported_at),'checked_at',clinical_private.backup_time(checked_at)) into result
 from clinical_private.backup_checks where clinician_id=actor and data_mode=(select data_mode from clinical_private.authorized_clinicians where user_id=actor)
 order by checked_at desc,id limit 1;
 return jsonb_build_object('latest',result);
end;$$;
revoke all on function clinical_private.clinical_backup_check_status() from public,anon;
grant execute on function clinical_private.clinical_backup_check_status() to authenticated;
create function public.clinical_backup_check_status() returns jsonb language sql volatile security invoker set search_path=pg_catalog as $$select clinical_private.clinical_backup_check_status()$$;
revoke all on function public.clinical_backup_check_status() from public,anon;
grant execute on function public.clinical_backup_check_status() to authenticated;
commit;
