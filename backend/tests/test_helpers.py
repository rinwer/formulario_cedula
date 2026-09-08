from datetime import date, timedelta

import pytest
from fastapi import HTTPException

import main


def test_sanear_nombre_archivo_reemplaza_caracteres_raros():
    assert main._sanear_nombre_archivo("FUS.La Pampa") == "FUS_La_Pampa"
    assert main._sanear_nombre_archivo("  Erney Cabrera  ") == "Erney_Cabrera"
    assert main._sanear_nombre_archivo("a/b\\c") == "a_b_c"


def test_sanear_nombre_archivo_vacio_da_un_valor_por_defecto():
    assert main._sanear_nombre_archivo("") == "export"
    assert main._sanear_nombre_archivo("///") == "export"


def test_parsear_fecha_query_usa_el_valor_por_defecto_si_no_se_manda():
    por_defecto = date(2026, 1, 15)
    assert main._parsear_fecha_query(None, por_defecto) == por_defecto
    assert main._parsear_fecha_query("", por_defecto) == por_defecto


def test_parsear_fecha_query_parsea_iso():
    assert main._parsear_fecha_query("2026-03-05", date(2026, 1, 1)) == date(2026, 3, 5)


def test_parsear_fecha_query_invalida_lanza_400():
    with pytest.raises(HTTPException) as exc_info:
        main._parsear_fecha_query("05/03/2026", date(2026, 1, 1))
    assert exc_info.value.status_code == 400


def test_validar_fecha_no_pasada_permite_hoy_y_futuro():
    hoy = date.today()
    main._validar_fecha_no_pasada(hoy)
    main._validar_fecha_no_pasada(hoy + timedelta(days=1))


def test_validar_fecha_no_pasada_rechaza_ayer():
    ayer = date.today() - timedelta(days=1)
    with pytest.raises(HTTPException) as exc_info:
        main._validar_fecha_no_pasada(ayer)
    assert exc_info.value.status_code == 400
