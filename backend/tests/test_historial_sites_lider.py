from datetime import date

import main


class TestAgruparTramosPorFecha:
    """Cubre el bug real que encontramos con datos de produccion: un
    hueco de fin de semana no debe partir una estadia, pero un cambio de
    site si."""

    def test_hueco_de_dias_no_parte_el_tramo(self):
        # 28 de agosto no tiene fila (fin de semana), pero es el mismo
        # site antes y despues: debe seguir siendo UN solo tramo.
        trabajo_por_fecha = {
            "2026-08-26": "site-A",
            "2026-08-27": "site-A",
            "2026-08-29": "site-A",
        }
        tramos = main._agrupar_tramos_por_fecha(trabajo_por_fecha, hoy=date(2026, 9, 1))

        assert len(tramos) == 1
        assert tramos[0]["trabajo_id"] == "site-A"
        assert tramos[0]["fecha_inicio"] == date(2026, 8, 26)
        assert tramos[0]["fecha_fin"] == date(2026, 8, 29)
        assert tramos[0]["es_actual"] is False

    def test_cambio_de_site_si_cierra_el_tramo(self):
        trabajo_por_fecha = {"2026-08-25": "site-B", "2026-08-26": "site-A"}
        tramos = main._agrupar_tramos_por_fecha(trabajo_por_fecha, hoy=date(2026, 9, 1))

        assert [t["trabajo_id"] for t in tramos] == ["site-B", "site-A"]
        assert all(t["fecha_inicio"] == t["fecha_fin"] for t in tramos)

    def test_el_tramo_que_llega_a_hoy_queda_marcado_actual(self):
        trabajo_por_fecha = {"2026-09-01": "site-A"}
        tramos = main._agrupar_tramos_por_fecha(trabajo_por_fecha, hoy=date(2026, 9, 1))

        assert tramos[0]["es_actual"] is True

    def test_tramo_terminado_antes_de_hoy_no_es_actual(self):
        trabajo_por_fecha = {"2026-08-20": "site-A"}
        tramos = main._agrupar_tramos_por_fecha(trabajo_por_fecha, hoy=date(2026, 9, 1))

        assert tramos[0]["es_actual"] is False
