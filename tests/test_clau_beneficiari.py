"""Clau canonica de beneficiari (macro canon_beneficiari, aplicada a int_fega).

Sintetic (sempre, CI-safe): construeix int_fega contra les fixtures (que inclouen variants
de forma juridica de la mateixa entitat ficticia) i comprova que la clau canonica:
  - col.lapsa variants de la MATEIXA entitat (SL / S. L. / S.L.U. <-> SLU) entre exercicis,
  - NO fusiona formes distintes (SL vs SA: precision-first),
  - plega accents i puntuacio (resultat en majuscules, sense punts).
"""

import os
import subprocess
import sys
from pathlib import Path

import duckdb
import pytest

ROOT = Path(__file__).resolve().parents[1]
DBT_DIR = ROOT / "ordit_dbt"
SYNTH_GLOB = str(
    ROOT / "tests" / "fixtures" / "raw" / "Beneficiarios_municipio_ejercicio_financiero_*.utf8.txt"
)


@pytest.fixture(scope="module")
def int_fega_db(tmp_path_factory) -> Path:
    """Construeix int_fega (i avantpassats) contra les fixtures sintetiques."""
    db_path = tmp_path_factory.mktemp("dbt") / "test.duckdb"
    env = {**os.environ, "DUCKDB_PATH": str(db_path)}
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "dbt.cli.main",
            "build",
            "--select",
            "+int_fega",
            # Nomes tests amb tots els refs seleccionats (evita tests de seeds no relacionats).
            "--indirect-selection",
            "cautious",
            "--profiles-dir",
            ".",
            "--vars",
            f"{{fega_raw_glob: '{SYNTH_GLOB}'}}",
        ],
        cwd=DBT_DIR,
        env=env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"dbt build ha fallat:\n{result.stdout}\n{result.stderr}"
    return db_path


def _canon(con, name: str) -> str:
    row = con.execute(
        "select distinct canonical_key from int_fega where beneficiary_name = ?", [name]
    ).fetchall()
    assert len(row) == 1, f"{name!r}: esperava 1 clau, n'hi ha {len(row)}"
    return row[0][0]


def test_variants_de_forma_col_lapsen(int_fega_db: Path):
    con = duckdb.connect(str(int_fega_db), read_only=True)
    # Mateixa entitat, formes "SL" / "S. L." en exercicis distints -> mateixa clau.
    assert _canon(con, "MAS FICTICI SL") == _canon(con, "MAS FICTICI S. L.") == "MAS FICTICI SL"
    # Forma "S.L.U." i "SLU" -> mateixa clau.
    assert (
        _canon(con, "HORT EXEMPLE S.L.U.") == _canon(con, "HORT EXEMPLE SLU") == "HORT EXEMPLE SLU"
    )


def test_formes_distintes_no_es_fusionen(int_fega_db: Path):
    con = duckdb.connect(str(int_fega_db), read_only=True)
    # Precision-first: SL i SA son formes distintes; no s'han de fusionar.
    assert _canon(con, "MAS FICTICI SL") != _canon(con, "MAS FICTICI SA")
    assert _canon(con, "MAS FICTICI SA") == "MAS FICTICI SA"


def test_majuscules_i_sense_puntuacio(int_fega_db: Path):
    con = duckdb.connect(str(int_fega_db), read_only=True)
    # La clau canonica plega accents/puntuacio: majuscules, sense punts.
    clau = _canon(con, "HORT EXEMPLE S.L.U.")
    assert clau == clau.upper()
    assert "." not in clau
    assert clau.strip() == clau
