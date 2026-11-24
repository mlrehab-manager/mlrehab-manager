-- Cover composite references reported by the hosted database advisor.
begin;
create index appointments_patient_owner on clinical_private.appointments(patient_id,clinician_id);
create index sessions_appointment_owner_patient on clinical_private.clinical_sessions(appointment_id,clinician_id,patient_id);
commit;
