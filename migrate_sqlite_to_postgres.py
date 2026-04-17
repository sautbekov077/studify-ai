import argparse
import os
from typing import Dict, List

from dotenv import load_dotenv
from sqlalchemy import MetaData, create_engine, select, text
from sqlalchemy.engine import Connection

from database import Base


def normalize_database_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


def get_table_rows(conn: Connection, table) -> List[Dict]:
    result = conn.execute(select(table))
    return [dict(row) for row in result.mappings()]


def reset_sequence(conn: Connection, table_name: str, pk_column: str) -> None:
    # Keep SERIAL/IDENTITY sequence in sync with imported IDs.
    conn.execute(
        text(
            """
            SELECT setval(
                pg_get_serial_sequence(:table_name, :pk_column),
                COALESCE((SELECT MAX(""" + pk_column + """) FROM """ + table_name + """), 1),
                (SELECT COUNT(*) > 0 FROM """ + table_name + """)
            )
            """
        ),
        {"table_name": table_name, "pk_column": pk_column},
    )


def migrate(sqlite_url: str, postgres_url: str, truncate: bool = False) -> None:
    sqlite_engine = create_engine(sqlite_url)
    postgres_engine = create_engine(postgres_url, pool_pre_ping=True)

    # Ensure target schema exists.
    Base.metadata.create_all(postgres_engine)

    source_meta = MetaData()
    source_meta.reflect(bind=sqlite_engine)

    target_meta = MetaData()
    target_meta.reflect(bind=postgres_engine)

    with sqlite_engine.connect() as sqlite_conn, postgres_engine.begin() as pg_conn:
        for source_table in source_meta.sorted_tables:
            target_table = target_meta.tables.get(source_table.name)
            if target_table is None:
                print(f"[skip] table '{source_table.name}' does not exist in target schema")
                continue

            if truncate:
                pg_conn.execute(text(f'TRUNCATE TABLE "{target_table.name}" RESTART IDENTITY CASCADE'))

            rows = get_table_rows(sqlite_conn, source_table)
            if not rows:
                print(f"[ok] table '{source_table.name}' is empty")
                continue

            pg_conn.execute(target_table.insert(), rows)
            print(f"[ok] migrated {len(rows)} rows into '{source_table.name}'")

            pk_columns = list(target_table.primary_key.columns)
            if len(pk_columns) == 1:
                pk_col = pk_columns[0]
                if str(pk_col.type).lower() in {"integer", "bigint", "smallint"}:
                    reset_sequence(pg_conn, target_table.name, pk_col.name)

    print("Migration completed successfully.")


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Migrate data from SQLite to PostgreSQL")
    parser.add_argument("--sqlite", default="sqlite:///./studify.db", help="SQLAlchemy URL for SQLite source")
    parser.add_argument(
        "--postgres",
        default=os.getenv("DATABASE_URL", ""),
        help="SQLAlchemy URL for PostgreSQL destination (or use DATABASE_URL)",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Truncate destination tables before migration",
    )

    args = parser.parse_args()

    if not args.postgres:
        raise SystemExit("DATABASE_URL is empty. Set it in .env or pass --postgres")

    sqlite_url = normalize_database_url(args.sqlite)
    postgres_url = normalize_database_url(args.postgres)

    migrate(sqlite_url=sqlite_url, postgres_url=postgres_url, truncate=args.truncate)


if __name__ == "__main__":
    main()
