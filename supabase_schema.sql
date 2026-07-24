-- Tabelle für alle eingehenden Kundenportal-Meldungen
create table if not exists meldungen (
    id bigint generated always as identity primary key,
    kategorie text not null check (kategorie in ('verschiebung', 'absage', 'reklamation', 'schaden', 'zusatz')),
    name text not null,
    objekt_id text not null,
    details text,
    created_at timestamptz not null default now()
);

-- Zuordnungstabelle: Aduna-Objekt <-> Beekeeper-Gruppenchat
-- (wird wöchentlich per match_objekte_zu_beekeeper.py aktualisiert)
create table if not exists objekt_beekeeper_mapping (
    objekt_id text primary key,
    kunde text not null,
    beekeeper_chat_id text,
    status text not null check (status in ('matched', 'unmatched', 'ambiguous')),
    updated_at timestamptz not null default now()
);

create index if not exists idx_meldungen_objekt_id on meldungen (objekt_id);
create index if not exists idx_meldungen_created_at on meldungen (created_at desc);
