-- Optional intake fields for fictitious patients. Existing rows and histories are not rewritten.
begin;
create or replace function clinical_private.clinical_patient_save_fields_test(p_id uuid,p_expected_revision integer,p_fields jsonb) returns jsonb language plpgsql volatile security definer set search_path=pg_catalog as $$
declare actor uuid:=clinical_private.require_clinician();saved clinical_private.patients;field text;max_length integer;patch jsonb:=p_fields;alias text;
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'object' or p_fields='{}'::jsonb then raise exception 'Campos no válidos' using errcode='22023';end if;
 for field in select jsonb_object_keys(p_fields) loop
  if field not in ('history','exam','diagnosis','goals','alias','reason','precautions') or jsonb_typeof(p_fields->field)<>'string' then raise exception 'Campo no editable' using errcode='22023';end if;
  max_length:=case when field in ('history','exam') then 8000 when field='alias' then 80 when field='precautions' then 4000 else 2000 end;
  if char_length(p_fields->>field)>max_length then raise exception 'Texto demasiado largo' using errcode='22023';end if;
 end loop;
 select * into saved from clinical_private.patients where id=p_id and clinician_id=actor and payload->'testOnly'='true'::jsonb and payload->>'fixture' in ('backup-roundtrip-v1','patient-workflow-v1') for update;
 if not found or saved.archived_at is not null or saved.revision is distinct from p_expected_revision then raise exception 'Versión antigua o ficha no disponible' using errcode='40001';end if;
 if p_fields ? 'alias' then
  if saved.payload->>'fixture'<>'patient-workflow-v1' then raise exception 'El nombre de las fichas iniciales se conserva' using errcode='22023';end if;
  alias:=clinical_private.patient_alias(p_fields->>'alias');patch:=patch||jsonb_build_object('alias',alias,'name','FICTICIO · '||alias);
 end if;
 return clinical_private.clinical_patient_save(p_id,p_expected_revision,saved.payload||patch);
end;$$;

-- Keep the existing public invoker wrapper and permissions; no new endpoint or table grants.
commit;
