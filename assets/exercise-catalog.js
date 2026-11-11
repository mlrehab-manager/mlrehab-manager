/* Names adapted into Spanish; research and classification notes: docs/EXERCISE_SOURCES.md. */
const EXERCISE_SOURCES = {
  rnoh: {
    label: "RNOH · Achilles Tendinopathy",
    url: "https://www.rnoh.nhs.uk/patients-and-visitors/patient-information-guides/achilles-tendinopathy",
  },
  newcastle: {
    label: "Newcastle Hospitals · Achilles Tendinopathy",
    url: "https://www.newcastle-hospitals.nhs.uk/wp-content/uploads/2021/11/2024-Newcastle-OHS-Achilles-Tendinopathy-leaflet-final_PRINT_ONLY.pdf",
  },
  aaos: {
    label: "AAOS · Shoulder Surgery Exercise Guide",
    url: "https://www.orthoinfo.org/bodypart/shoulder/shoulder-surgery-exercise-guide/",
  },
  fife: {
    label: "NHS Fife · Tennis Elbow",
    url: "https://www.nhsfife.org/services/all-services/patient-advice/tennis-elbow-lateral-epicondylitisosis/",
  },
  rjah: {
    label: "RJAH · Tennis Elbow",
    url: "https://www.rjah.nhs.uk/our-services/therapy/supported-self-care/tennis-elbow/",
  },
  leeds: {
    label: "Leeds Community Healthcare · Patella Tendinopathy",
    url: "https://leedscommunityhealthcare.nhs.uk/our-services-a-z/musculoskeletal-msk/knee-problems/known-diagnosed-knee-problems/patella-tendonopathy/",
  },
  patellar: {
    label: "Clinical Management of Patellar Tendinopathy · revisión clínica",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9528703/",
  },
  cuh: {
    label: "Cambridge University Hospitals · Knee Exercises",
    url: "https://www.cuh.nhs.uk/patient-information/knee-exercises/",
  },
  leapp: {
    label: "Houston Methodist · LEAPP",
    url: "https://www.houstonmethodist.org/leapp/",
  },
  uhdb: {
    label: "University Hospitals Derby and Burton · Knee Rehabilitation",
    url: "https://www.uhdb.nhs.uk/knee-rehabilitation-late-stage/",
  },
};
const BUILTIN_EXERCISES = [
  {
    name: "Retracción cervical",
    category: "other",
  },
  {
    name: "Flexión cervical",
    category: "other",
  },
  {
    name: "Rotación cervical",
    category: "other",
  },
  {
    name: "Inclinación lateral cervical",
    category: "other",
  },
  {
    name: "Rotación torácica en decúbito lateral",
    category: "other",
  },
  {
    name: "Extensión torácica sobre rodillo",
    category: "other",
  },
  {
    name: "Movilidad de columna en gato-camello",
    category: "other",
  },
  {
    name: "Basculación pélvica",
    category: "other",
  },
  {
    name: "Puente de glúteos",
    category: "dynamic",
  },
  {
    name: "Puente de glúteos unilateral",
    category: "dynamic",
  },
  {
    name: "Bird dog",
    category: "other",
  },
  {
    name: "Dead bug",
    category: "other",
  },
  {
    name: "Plancha frontal",
    category: "isometric",
  },
  {
    name: "Plancha lateral",
    category: "isometric",
  },
  {
    name: "Press Pallof",
    category: "other",
  },
  {
    name: "Flexión de hombro asistida con bastón",
    category: "other",
  },
  {
    name: "Abducción de hombro asistida con bastón",
    category: "other",
  },
  {
    name: "Péndulo de hombro",
    category: "other",
  },
  {
    name: "Deslizamiento de brazos en pared",
    category: "other",
  },
  {
    name: "Rotación externa de hombro con banda",
    category: "dynamic",
  },
  {
    name: "Rotación interna de hombro con banda",
    category: "dynamic",
  },
  {
    name: "Remo con banda elástica",
    category: "dynamic",
  },
  {
    name: "Retracción escapular",
    category: "other",
  },
  {
    name: "Serrato anterior en pared",
    category: "dynamic",
  },
  {
    name: "Flexiones en pared",
    category: "dynamic",
  },
  {
    name: "Flexiones de brazos",
    category: "dynamic",
  },
  {
    name: "Elevación de hombro en plano escapular",
    category: "dynamic",
  },
  {
    name: "Flexión de codo con mancuerna",
    category: "dynamic",
  },
  {
    name: "Extensión de codo con banda",
    category: "dynamic",
  },
  {
    name: "Pronación y supinación de antebrazo",
    category: "dynamic",
  },
  {
    name: "Flexión de muñeca con mancuerna",
    category: "dynamic",
  },
  {
    name: "Extensión de muñeca con mancuerna",
    category: "dynamic",
  },
  {
    name: "Prensión de pelota",
    category: "dynamic",
  },
  {
    name: "Oposición del pulgar",
    category: "other",
  },
  {
    name: "Deslizamientos tendinosos de la mano",
    category: "other",
  },
  {
    name: "Flexión de cadera en bipedestación",
    category: "dynamic",
  },
  {
    name: "Abducción de cadera en decúbito lateral",
    category: "dynamic",
  },
  {
    name: "Abducción de cadera con banda",
    category: "dynamic",
  },
  {
    name: "Extensión de cadera en bipedestación",
    category: "dynamic",
  },
  {
    name: "Clamshell",
    category: "dynamic",
  },
  {
    name: "Marcha lateral con banda",
    category: "dynamic",
  },
  {
    name: "Sentadilla",
    category: "dynamic",
  },
  {
    name: "Sentadilla a silla",
    category: "dynamic",
  },
  {
    name: "Sentadilla dividida",
    category: "dynamic",
  },
  {
    name: "Zancada hacia atrás",
    category: "dynamic",
  },
  {
    name: "Subida a escalón",
    category: "dynamic",
  },
  {
    name: "Bajada de escalón",
    category: "dynamic",
  },
  {
    name: "Peso muerto rumano",
    category: "dynamic",
  },
  {
    name: "Peso muerto rumano unilateral",
    category: "dynamic",
  },
  {
    name: "Elevación de pierna recta",
    category: "dynamic",
  },
  {
    name: "Contracción isométrica de cuádriceps",
    category: "isometric",
  },
  {
    name: "Extensión de rodilla sentado",
    category: "dynamic",
  },
  {
    name: "Flexión de rodilla en decúbito prono",
    category: "dynamic",
  },
  {
    name: "Deslizamiento de talón",
    category: "other",
  },
  {
    name: "Elevación de talones de pie",
    category: "dynamic",
  },
  {
    name: "Elevación de talón unilateral",
    category: "dynamic",
  },
  {
    name: "Elevación de talones sentado",
    category: "dynamic",
  },
  {
    name: "Dorsiflexión de tobillo con banda",
    category: "dynamic",
  },
  {
    name: "Inversión de tobillo con banda",
    category: "dynamic",
  },
  {
    name: "Eversión de tobillo con banda",
    category: "dynamic",
  },
  {
    name: "Movilidad de tobillo rodilla a pared",
    category: "other",
  },
  {
    name: "Equilibrio unipodal",
    category: "other",
  },
  {
    name: "Marcha en tándem",
    category: "other",
  },
  {
    name: "Transferencias de peso",
    category: "other",
  },
  {
    name: "Sentarse y levantarse",
    category: "dynamic",
  },
  {
    name: "Marcha de puntillas",
    category: "other",
  },
  {
    name: "Marcha de talones",
    category: "other",
  },
  {
    name: "Sentadilla isométrica en pared",
    category: "isometric",
    source: "leeds",
  },
  {
    name: "Sentadilla española isométrica",
    category: "isometric",
    source: "patellar",
  },
  {
    name: "Extensión isométrica de rodilla en máquina",
    category: "isometric",
    source: "patellar",
  },
  {
    name: "Elevación isométrica bilateral de talones",
    category: "isometric",
    source: "newcastle",
  },
  {
    name: "Elevación isométrica unilateral de talón",
    category: "isometric",
    source: "newcastle",
  },
  {
    name: "Elevación isométrica de talones con rodillas flexionadas",
    category: "isometric",
    source: "rnoh",
  },
  {
    name: "Extensión isométrica de hombro",
    category: "isometric",
    source: "aaos",
  },
  {
    name: "Rotación externa isométrica de hombro",
    category: "isometric",
    source: "aaos",
  },
  {
    name: "Rotación interna isométrica de hombro",
    category: "isometric",
    source: "aaos",
  },
  {
    name: "Aducción isométrica de hombro",
    category: "isometric",
    source: "aaos",
  },
  {
    name: "Abducción isométrica de hombro",
    category: "isometric",
    source: "aaos",
  },
  {
    name: "Extensión isométrica de muñeca",
    category: "isometric",
    source: "rjah",
  },
  {
    name: "Elevación de talones con énfasis concéntrico",
    category: "concentric",
    source: "rnoh",
  },
  {
    name: "Elevación de talones con rodillas flexionadas y énfasis concéntrico",
    category: "concentric",
    source: "rnoh",
  },
  {
    name: "Extensión concéntrica de muñeca con carga",
    category: "concentric",
    source: "fife",
  },
  {
    name: "Flexión de codo con énfasis concéntrico",
    category: "concentric",
    source: "rnoh",
  },
  {
    name: "Extensión de rodilla con énfasis concéntrico",
    category: "concentric",
    source: "patellar",
  },
  {
    name: "Descenso excéntrico de talón con rodilla extendida",
    category: "eccentric",
    source: "rnoh",
  },
  {
    name: "Descenso excéntrico de talón con rodilla flexionada",
    category: "eccentric",
    source: "rnoh",
  },
  {
    name: "Descenso excéntrico unilateral de talón",
    category: "eccentric",
    source: "newcastle",
  },
  {
    name: "Extensión excéntrica de muñeca con carga",
    category: "eccentric",
    source: "fife",
  },
  {
    name: "Flexión de codo con énfasis excéntrico",
    category: "eccentric",
    source: "rnoh",
  },
  {
    name: "Sentadilla declinada con énfasis excéntrico",
    category: "eccentric",
    source: "patellar",
  },
  {
    name: "Sentadilla unipodal",
    category: "dynamic",
    source: "cuh",
  },
  {
    name: "Prensa de piernas",
    category: "dynamic",
    source: "patellar",
  },
  {
    name: "Sentadilla con carga",
    category: "dynamic",
    source: "patellar",
  },
  {
    name: "Hack squat",
    category: "dynamic",
    source: "patellar",
  },
  {
    name: "Rotación externa de hombro en decúbito lateral con carga",
    category: "dynamic",
    source: "aaos",
  },
  {
    name: "Rotación interna de hombro en decúbito lateral con carga",
    category: "dynamic",
    source: "aaos",
  },
  {
    name: "Sentadilla con salto",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos horizontales bipodales",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos laterales tipo patinador",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos con rodillas al pecho",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos con giro de 180 grados",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos bipodales sobre línea",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Triple salto unipodal",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos bipodales sobre conos",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos en tijera",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos unipodales horizontales",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Saltos unipodales sobre conos",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Salto al cajón seguido de salto vertical",
    category: "plyometric",
    source: "leapp",
  },
  {
    name: "Rebotes unipodales sobre escalón",
    category: "plyometric",
    source: "cuh",
  },
  {
    name: "Rebotes bipodales sobre escalón",
    category: "plyometric",
    source: "uhdb",
  },
  {
    name: "Saltos laterales unipodales sobre marca",
    category: "plyometric",
    source: "uhdb",
  },
  {
    name: "Sentadilla con salto seguida de zancada",
    category: "plyometric",
    source: "uhdb",
  },
];
const INITIAL_EXERCISES = BUILTIN_EXERCISES.map((exercise) => exercise.name);
