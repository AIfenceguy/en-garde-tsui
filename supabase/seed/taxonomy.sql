-- Starter taxonomy. Users can add more from the UI.
-- All seed rows have created_by = null so RLS treats them as system-owned.

-- ============================================================
-- topic taxonomy (private-lesson topics)
-- ============================================================
insert into topic_taxonomy (slug, label, category) values
    ('parry-4',           'Parry 4',                       'defense'),
    ('parry-6',           'Parry 6',                       'defense'),
    ('parry-7',           'Parry 7',                       'defense'),
    ('parry-8',           'Parry 8',                       'defense'),
    ('parry-riposte',     'Parry-riposte (one motion)',    'defense'),
    ('parry-while-retreat','Parry-riposte while retreating','defense'),
    ('counter-parry',     'Counter-parry',                 'defense'),
    ('attack-in-prep',    'Attack in preparation',         'attack'),
    ('direct-attack',     'Direct attack',                 'attack'),
    ('compound-attack',   'Compound attack',               'attack'),
    ('disengage',         'Disengage',                     'attack'),
    ('beat-attack',       'Beat attack',                   'attack'),
    ('feint-attack',      'Feint attack',                  'attack'),
    ('counter-attack',    'Counter-attack',                'attack'),
    ('fleche',            'Fleche',                        'attack'),
    ('lunge-mechanics',   'Lunge mechanics',               'footwork'),
    ('distance-control',  'Distance control',              'tactical'),
    ('second-intention',  'Second intention',              'tactical'),
    ('first-intention',   'First intention',               'tactical'),
    ('preparation-actions','Preparation actions',          'tactical'),
    ('point-control',     'Point control',                 'blade'),
    ('blade-pressure',    'Blade pressure',                'blade'),
    ('takeovers',         'Takeovers / engagements',       'blade')
on conflict (slug) do nothing;

-- ============================================================
-- drill taxonomy
-- ============================================================
insert into drill_taxonomy (slug, label, category, domain) values
    -- physical (Raedyn explosive focus)
    ('jump-squats',       'Jump squats',                   'plyometric',  'physical'),
    ('broad-jumps',       'Broad jumps',                   'plyometric',  'physical'),
    ('depth-jumps',       'Depth jumps',                   'plyometric',  'physical'),
    ('single-leg-bounds', 'Single-leg bounds',             'plyometric',  'physical'),
    ('core-circuit',      'Core circuit',                  'strength',    'physical'),
    ('plank-circuit',     'Plank circuit',                 'strength',    'physical'),
    ('animal-movements',  'Animal movements',              'strength',    'physical'),
    ('footwork-ladder',   'Footwork ladder',               'agility',     'physical'),
    ('weapon-arm-circuit','Weapon-arm endurance',          'endurance',   'physical'),
    ('mobility-flow',     'Mobility flow',                 'mobility',    'physical'),
    ('sprint-intervals',  'Sprint intervals (10–20m × 6–8)','conditioning','physical'),
    ('active-recovery',   'Active recovery',               'recovery',    'physical'),
    ('free-play',         'Free play / outdoor sport',     'recovery',    'physical'),
    ('full-rest',         'Full rest day',                 'recovery',    'physical'),
    -- fencing drills
    ('parry-riposte-pair','Parry-riposte pair drill',      'defense',     'fencing'),
    ('distance-game',     'Distance / no-touch game',      'tactical',    'fencing'),
    ('attack-on-prep-drill','Attack-on-prep drill',        'attack',      'fencing'),
    ('blade-takeover',    'Blade takeover drill',          'blade',       'fencing'),
    ('counter-time-drill','Counter-time drill',            'tactical',    'fencing'),
    ('open-bouting',      'Open bouting',                  'application', 'fencing'),
    -- mental drills
    ('visualization-pr',  'Visualization: parry-riposte',  'visualization','mental'),
    ('visualization-14all','Visualization: 14-14 in DE',   'visualization','mental'),
    ('visualization-down','Visualization: down 2-4 in pool','visualization','mental'),
    ('visualization-first','Visualization: first touch of tournament','visualization','mental'),
    ('breath-4-7-8',      '4-7-8 breathing',               'breathwork', 'mental'),
    ('box-breathing',     'Box breathing',                 'breathwork', 'mental'),
    ('body-scan',         'Body scan',                     'meditation', 'mental'),
    ('in-bout-cue',       'In-bout cue rehearsal',         'cue',        'mental')
on conflict (slug) do nothing;

-- ============================================================
-- tactic taxonomy
-- ============================================================
insert into tactic_taxonomy (slug, label, kind) values
    -- scoring actions
    ('counter-attack',     'Counter-attack',           'scoring'),
    ('attack-in-prep',     'Attack in prep',           'scoring'),
    ('parry-riposte',      'Parry-riposte',            'scoring'),
    ('surprise-attack',    'Surprise attack',          'scoring'),
    ('fake-and-finish',    'Fake and finish',          'scoring'),
    ('second-intention',   'Second intention',         'scoring'),
    ('direct-attack',      'Direct attack',            'scoring'),
    ('compound-attack',    'Compound attack',          'scoring'),
    ('beat-attack',        'Beat attack',              'scoring'),
    ('disengage-finish',   'Disengage finish',         'scoring'),
    ('flick',              'Flick',                    'scoring'),
    ('remise',             'Remise',                   'scoring'),
    -- failure patterns (how opponent scored on me)
    ('aggressive-charge',  'Aggressive charge',        'failure'),
    ('counter-time',       'Counter-time',             'failure'),
    ('disengage',          'Disengage caught me',      'failure'),
    ('running-attack',     'Running attack',           'failure'),
    ('beat-finish',        'Beat caught my blade',     'failure'),
    ('out-of-distance',    'Drew me out of distance',  'failure'),
    ('preparation-attack', 'Attacked my prep',         'failure'),
    ('flick-failure',      'Flick over my parry',      'failure'),
    ('point-in-line',      'Point in line',            'failure')
on conflict (slug) do nothing;
