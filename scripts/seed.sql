-- Jeu de données de démo pour le dev local.
-- Le schéma est créé par le serveur (server/src/db.ts) : ce fichier n'insère que des données.
-- Usage : sqlite3 server/data/cenon.db < scripts/seed.sql
-- ponytail: données générées par CTE récursive plutôt que 2000 INSERT écrits à la main.

PRAGMA foreign_keys = ON;

BEGIN;

DELETE FROM patient_annotations;
DELETE FROM patient_comments;
DELETE FROM manual_adjustments;
DELETE FROM clinical_acts;
DELETE FROM appointments;
DELETE FROM import_logs;
DELETE FROM logosw_dictionary;
DELETE FROM patients;
DELETE FROM sqlite_sequence WHERE name IN
  ('patients','appointments','clinical_acts','import_logs','patient_annotations','patient_comments','manual_adjustments');

-- 1. Patients (24). Les 4 derniers n'ont pas de dossier LogosW -> alimentent l'écran de matching.
INSERT INTO patients (id, doctolib_id, civilite, nom, prenom, nom_complet_norm, nom_doctolib,
                      date_naissance, email, telephone, adresse, code_postal, ville,
                      nom_logosw, dossier_logosw, has_warning) VALUES
 (1 ,'DOC-1001','Mme','MARTIN','Sophie'    ,'martin sophie'    ,'MARTIN Sophie'    ,'1982-03-14','sophie.martin@example.fr' ,'0612345601','12 rue Camille Pelletan','33150','Cenon'    ,'MARTIN Sophie'    ,'LW-0001',0),
 (2 ,'DOC-1002','M.' ,'BERNARD','Julien'   ,'bernard julien'   ,'BERNARD Julien'   ,'1975-11-02','julien.bernard@example.fr','0612345602','4 avenue Thiers'        ,'33100','Bordeaux' ,'BERNARD Julien'   ,'LW-0002',0),
 (3 ,'DOC-1003','Mme','DUBOIS','Camille'   ,'dubois camille'   ,'DUBOIS Camille'   ,'1990-06-27','camille.dubois@example.fr','0612345603','8 rue de la Gare'       ,'33150','Cenon'    ,'DUBOIS Camille'   ,'LW-0003',0),
 (4 ,'DOC-1004','M.' ,'THOMAS','Nicolas'   ,'thomas nicolas'   ,'THOMAS Nicolas'   ,'1968-01-19','nicolas.thomas@example.fr','0612345604','31 cours Le Rouzic'     ,'33100','Bordeaux' ,'THOMAS Nicolas'   ,'LW-0004',0),
 (5 ,'DOC-1005','Mme','ROBERT','Léa'       ,'robert lea'       ,'ROBERT Léa'       ,'1998-09-05','lea.robert@example.fr'    ,'0612345605','2 place Aristide Briand','33150','Cenon'    ,'ROBERT Lea'       ,'LW-0005',0),
 (6 ,'DOC-1006','M.' ,'RICHARD','Antoine'  ,'richard antoine'  ,'RICHARD Antoine'  ,'1985-04-23','antoine.richard@example.fr','0612345606','17 rue Jean Jaurès'    ,'33270','Floirac'  ,'RICHARD Antoine'  ,'LW-0006',0),
 (7 ,'DOC-1007','Mme','PETIT','Manon'      ,'petit manon'      ,'PETIT Manon'      ,'2001-12-11','manon.petit@example.fr'   ,'0612345607','5 rue des Écoles'       ,'33150','Cenon'    ,'PETIT Manon'      ,'LW-0007',0),
 (8 ,'DOC-1008','M.' ,'DURAND','Maxime'    ,'durand maxime'    ,'DURAND Maxime'    ,'1979-07-30','maxime.durand@example.fr' ,'0612345608','44 avenue Carnot'       ,'33150','Cenon'    ,'DURAND Maxime'    ,'LW-0008',0),
 (9 ,'DOC-1009','Mme','LEROY','Chloé'      ,'leroy chloe'      ,'LEROY Chloé'      ,'1993-02-08','chloe.leroy@example.fr'   ,'0612345609','9 rue Pasteur'          ,'33310','Lormont'  ,'LEROY Chloe'      ,'LW-0009',0),
 (10,'DOC-1010','M.' ,'MOREAU','Hugo'      ,'moreau hugo'      ,'MOREAU Hugo'      ,'1961-05-16','hugo.moreau@example.fr'   ,'0612345610','21 rue Lafontaine'      ,'33100','Bordeaux' ,'MOREAU Hugo'      ,'LW-0010',1),
 (11,'DOC-1011','Mme','SIMON','Inès'       ,'simon ines'       ,'SIMON Inès'       ,'2005-10-01','ines.simon@example.fr'    ,'0612345611','3 rue Gambetta'         ,'33150','Cenon'    ,'SIMON Ines'       ,'LW-0011',0),
 (12,'DOC-1012','M.' ,'LAURENT','Théo'     ,'laurent theo'     ,'LAURENT Théo'     ,'1996-08-21','theo.laurent@example.fr'  ,'0612345612','58 rue de Lyon'         ,'33270','Floirac'  ,'LAURENT Theo'     ,'LW-0012',0),
 (13,'DOC-1013','Mme','LEFEVRE','Amandine' ,'lefevre amandine' ,'LEFEVRE Amandine' ,'1988-01-03','amandine.lefevre@example.fr','0612345613','11 rue Victor Hugo'   ,'33150','Cenon'    ,'LEFEVRE Amandine' ,'LW-0013',0),
 (14,'DOC-1014','M.' ,'MICHEL','Rémi'      ,'michel remi'      ,'MICHEL Rémi'      ,'1972-03-29','remi.michel@example.fr'   ,'0612345614','7 allée des Tilleuls'   ,'33310','Lormont'  ,'MICHEL Remi'      ,'LW-0014',0),
 (15,'DOC-1015','Mme','GARCIA','Nadia'     ,'garcia nadia'     ,'GARCIA Nadia'     ,'1984-11-25','nadia.garcia@example.fr'  ,'0612345615','26 rue Jules Guesde'    ,'33150','Cenon'    ,'GARCIA Nadia'     ,'LW-0015',0),
 (16,'DOC-1016','M.' ,'DAVID','Samuel'     ,'david samuel'     ,'DAVID Samuel'     ,'1959-06-12','samuel.david@example.fr'  ,'0612345616','14 rue Calixte Camelle' ,'33150','Cenon'    ,'DAVID Samuel'     ,'LW-0016',0),
 (17,'DOC-1017','Mme','BERTRAND','Élodie'  ,'bertrand elodie'  ,'BERTRAND Élodie'  ,'1991-04-07','elodie.bertrand@example.fr','0612345617','33 avenue Vincent Auriol','33270','Floirac' ,'BERTRAND Elodie'  ,'LW-0017',0),
 (18,'DOC-1018','M.' ,'ROUX','Kevin'       ,'roux kevin'       ,'ROUX Kevin'       ,'1994-09-18','kevin.roux@example.fr'    ,'0612345618','1 rue du Port'          ,'33310','Lormont'  ,'ROUX Kevin'       ,'LW-0018',0),
 (19,'DOC-1019','Mme','VINCENT','Sarah'    ,'vincent sarah'    ,'VINCENT Sarah'    ,'1999-05-24','sarah.vincent@example.fr' ,'0612345619','19 rue Marcel Sembat'   ,'33150','Cenon'    ,'VINCENT Sarah'    ,'LW-0019',0),
 (20,'DOC-1020','M.' ,'FOURNIER','Damien'  ,'fournier damien'  ,'FOURNIER Damien'  ,'1977-02-02','damien.fournier@example.fr','0612345620','6 rue des Acacias'     ,'33150','Cenon'    ,'FOURNIER Damien'  ,'LW-0020',0),
 -- Non rapprochés : dossier_logosw NULL. 21/22 ont un homologue au dictionnaire (nom inversé, accents),
 -- 23/24 n'en ont aucun -> restent orphelins.
 (21,'DOC-1021','Mme','HENRY','Anaïs'      ,'henry anais'      ,'HENRY Anaïs'      ,'1986-10-09','anais.henry@example.fr'   ,'0612345621','29 rue Aristide Briand' ,'33150','Cenon'    ,NULL,NULL,1),
 (22,'DOC-1022','M.' ,'GAUTIER','Pierre'   ,'gautier pierre'   ,'GAUTIER Pierre'   ,'1970-12-30','pierre.gautier@example.fr','0612345622','48 rue Camille Pelletan','33150','Cenon'    ,NULL,NULL,1),
 (23,'DOC-1023','Mme','NGUYEN','Linh'      ,'nguyen linh'      ,'NGUYEN Linh'      ,'2003-03-03','linh.nguyen@example.fr'   ,'0612345623','2 rue de la Souys'      ,'33270','Floirac'  ,NULL,NULL,0),
 (24,'DOC-1024','M.' ,'OLIVIER','Basile'   ,'olivier basile'   ,'OLIVIER Basile'   ,'1964-08-15','basile.olivier@example.fr','0612345624','10 rue Édouard Vaillant','33310','Lormont'  ,NULL,NULL,0);

-- 1b. Volume de remplissage : patients 25 à 80, générés par combinaison nom × prénom.
--     Les 24 premiers restent écrits à la main : ce sont eux qui portent les cas de
--     rapprochement (inversions, accents, orphelins).
WITH RECURSIVE ids(i) AS (
  SELECT 25 UNION ALL SELECT i + 1 FROM ids WHERE i < 80
),
noms(k, nom) AS (VALUES
  (0,'ADAM'),(1,'BLANC'),(2,'CHEVALIER'),(3,'DENIS'),
  (4,'FONTAINE'),(5,'GIRAUD'),(6,'MARCHAND'),(7,'PERROT')),
prenoms(k, prenom) AS (VALUES
  (0,'Alice'),(1,'Bastien'),(2,'Clara'),(3,'Dorian'),
  (4,'Emma'),(5,'Farid'),(6,'Gaëlle'))
INSERT INTO patients (id, doctolib_id, civilite, nom, prenom, nom_complet_norm, nom_doctolib,
                      date_naissance, email, telephone, adresse, code_postal, ville,
                      nom_logosw, dossier_logosw, has_warning)
SELECT i,
       'DOC-1' || printf('%03d', i),
       CASE WHEN i % 2 = 0 THEN 'M.' ELSE 'Mme' END,
       nom, prenom,
       lower(nom) || ' ' || lower(prenom),
       nom || ' ' || prenom,
       date('1955-01-01', '+' || (i * 373 % 16000) || ' day'),
       lower(prenom) || '.' || lower(nom) || '@example.fr',
       '06' || printf('%08d', 12345600 + i),
       (i % 90 + 1) || ' rue des Lilas',
       CASE i % 3 WHEN 0 THEN '33150' WHEN 1 THEN '33270' ELSE '33310' END,
       CASE i % 3 WHEN 0 THEN 'Cenon'  WHEN 1 THEN 'Floirac' ELSE 'Lormont' END,
       nom || ' ' || prenom,
       'LW-' || printf('%04d', i),
       0
FROM ids
JOIN noms    ON noms.k    = i % 8
JOIN prenoms ON prenoms.k = i % 7;

-- 2. Dictionnaire LogosW. 21/22 sont volontairement dégradés (nom/prénom inversés, accents perdus)
--    pour exercer la similarité de src/lib/similarity.ts.
INSERT INTO logosw_dictionary (dossier_id, nom, prenom, nom_complet_norm, date_naissance)
SELECT COALESCE(dossier_logosw, 'LW-00' || id), nom, prenom, nom_complet_norm, date_naissance
FROM patients WHERE id <= 20 OR id >= 25;
INSERT INTO logosw_dictionary (dossier_id, nom, prenom, nom_complet_norm, date_naissance) VALUES
 ('LW-0021','ANAIS','HENRY','anais henry','1986-10-09'),
 ('LW-0022','GAUTIE','Pierr' ,'gautie pierr','1970-12-30');

-- 3. Rendez-vous : 3 mois ouvrés, 6 créneaux/jour, patients tournants.
--    ~6 % annulés, ~6 % absents ; le reste en 'Vu'.
WITH RECURSIVE days(d) AS (
  SELECT date('2026-07-01')
  UNION ALL SELECT date(d, '+1 day') FROM days WHERE d < date('2026-09-28')
),
slots(s) AS (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL
             SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10),
grid AS (
  SELECT d, s, CAST(julianday(d) AS INTEGER) AS jd
  FROM days JOIN slots
  WHERE strftime('%w', d) NOT IN ('0', '6')
)
INSERT INTO appointments (appointment_uid, patient_id, date, heure, praticien, motif, statut, import_id)
SELECT
  'RDV-' || d || '-' || s,
  ((jd + s * 5) % 80) + 1,
  d,
  printf('%02d:%02d', 8 + (s - 1) / 2, CASE WHEN (s - 1) % 2 = 0 THEN 30 ELSE 0 END),
  CASE (jd + s) % 3 WHEN 0 THEN 'Dr. Réda Mechouk' WHEN 1 THEN 'Dr. Medy Fakreldin' ELSE 'Dr. Hamza Gafsi' END,
  CASE (jd * 3 + s) % 6
    WHEN 0 THEN 'Contrôle annuel' WHEN 1 THEN 'Détartrage' WHEN 2 THEN 'Soin carie'
    WHEN 3 THEN 'Pose couronne'   WHEN 4 THEN 'Urgence douleur' ELSE 'Consultation implant' END,
  CASE WHEN (jd + s * 7) % 17 = 0 THEN 'Annulé'
       WHEN (jd + s * 7) % 17 = 1 THEN 'Absent'
       ELSE 'Vu' END,
  'IMP-SEED-DOCTOLIB'
FROM grid;

-- 4. Actes cliniques, un par RDV honoré. 1 RDV 'Vu' sur 13 reste sans acte
--    -> alimente le panneau « actes manquants » du dashboard.
INSERT INTO clinical_acts (patient_id, date, libelle, montant_acte, reglement_somme, type, source,
                           logosw_praticien, cotation, dents, import_id)
SELECT a.patient_id, a.date,
  CASE CAST(julianday(a.date) AS INTEGER) % 8
    WHEN 0 THEN 'Consultation'            WHEN 1 THEN 'Détartrage complet'
    WHEN 2 THEN 'Traitement carie 1 face' WHEN 3 THEN 'Couronne céramo-métallique'
    WHEN 4 THEN 'Extraction dent de sagesse' WHEN 5 THEN 'Radiographie panoramique'
    WHEN 6 THEN 'Traitement endodontique' ELSE 'Pose implant' END,
  CASE CAST(julianday(a.date) AS INTEGER) % 8
    WHEN 0 THEN 23.00 WHEN 1 THEN 43.38 WHEN 2 THEN 33.74 WHEN 3 THEN 550.00
    WHEN 4 THEN 83.60 WHEN 5 THEN 21.28 WHEN 6 THEN 93.99 ELSE 1100.00 END,
  0, 'ACTE', 'LogosW',
  CASE a.praticien WHEN 'Dr. Réda Mechouk' THEN 'RM' WHEN 'Dr. Medy Fakreldin' THEN 'MF' ELSE 'HG' END,
  CASE CAST(julianday(a.date) AS INTEGER) % 8
    WHEN 0 THEN 'C'   WHEN 1 THEN 'HBJD001' WHEN 2 THEN 'HBMD038' WHEN 3 THEN 'HBLD038'
    WHEN 4 THEN 'HBGD036' WHEN 5 THEN 'HBQK002' WHEN 6 THEN 'HBFD001' ELSE 'HBLD032' END,
  CASE WHEN CAST(julianday(a.date) AS INTEGER) % 8 IN (0, 1, 5) THEN NULL
       ELSE CAST(11 + (a.id % 18) AS TEXT) END,
  'IMP-SEED-LOGOSW'
FROM appointments a
WHERE a.statut = 'Vu' AND a.id % 13 <> 0;

-- 5. Règlements : soldé pour 2 actes sur 3, partiel (60 %) pour le reste
--    -> reste à recouvrer non nul sur l'écran Recouvrement.
INSERT INTO clinical_acts (patient_id, date, libelle, montant_acte, reglement_somme, type, source,
                           logosw_praticien, import_id)
SELECT c.patient_id,
  date(c.date, '+' || (c.id % 5) || ' day'),
  'Règlement ' || CASE WHEN c.id % 3 = 0 THEN 'partiel' ELSE 'CB' END,
  0,
  ROUND(c.montant_acte * CASE WHEN c.id % 3 = 0 THEN 0.6 ELSE 1.0 END, 2),
  'REGLEMENT', 'LogosW', c.logosw_praticien, 'IMP-SEED-LOGOSW'
FROM clinical_acts c
WHERE c.type = 'ACTE' AND c.id % 9 <> 0;   -- 1 acte sur 9 totalement impayé

-- 6. Journaux d'import, ajustements manuels, commentaires, annotation.
INSERT INTO import_logs (timestamp, source, record_count, total_prod, total_enc, import_id, anomalies_json) VALUES
 ('2026-09-28 08:12:00','doctolib', (SELECT COUNT(*) FROM appointments),  0, 0, 'IMP-SEED-DOCTOLIB','[]'),
 ('2026-09-28 08:12:40','logosw',   (SELECT COUNT(*) FROM clinical_acts),
   (SELECT ROUND(SUM(montant_acte),2)    FROM clinical_acts WHERE type='ACTE'),
   (SELECT ROUND(SUM(reglement_somme),2) FROM clinical_acts WHERE type='REGLEMENT'),
   'IMP-SEED-LOGOSW','[]'),
 ('2026-09-28 08:13:10','logosw_patients', (SELECT COUNT(*) FROM logosw_dictionary), 0, 0, 'IMP-SEED-DICT','[]');

INSERT INTO manual_adjustments (patient_id, date, libelle, montant_acte, reglement_somme, type, comment) VALUES
 (10,'2026-09-15','Remise commerciale geste cabinet', -50.00, 0, 'ACTE', 'Geste suite au retard de livraison prothèse'),
 (3 ,'2026-09-22','Règlement chèque hors LogosW', 0, 120.00, 'REGLEMENT', 'Chèque encaissé le 22/09, non remonté par LogosW');

INSERT INTO patient_comments (patient_id, content) VALUES
 (10,'Patient sous anticoagulants — prévenir avant toute extraction.'),
 (21,'Dossier LogosW à rapprocher : identité saisie en inversant nom et prénom.');

INSERT INTO patient_annotations (patient_id, date_rendez_vous, is_dismissed, comment) VALUES
 (22,'2026-09-11', 1, 'Acte facturé sur le dossier du conjoint, écart normal.');

-- 7. Version DB : force le refetch du snapshot par les clients déjà ouverts.
UPDATE _meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'db_version';
UPDATE _meta SET value = strftime('%Y-%m-%dT%H:%M:%fZ','now')      WHERE key = 'updated_at';

COMMIT;
