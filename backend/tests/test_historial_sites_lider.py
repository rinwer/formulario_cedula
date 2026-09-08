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


class TestUnificarPorSite:
    """Cubre el segundo bug real: el lider vuelve al MISMO site despues
    de una interrupcion (otro site de un solo dia, tipico del respaldo
    de avances_diarios) y eso no debe verse como dos pasos distintos."""

    def _fila(self, site, inicio, fin, dias, es_actual=False):
        return {
            "site": site,
            "zona": "Oriente",
            "fecha_inicio": inicio,
            "fecha_fin": fin,
            "dias": dias,
            "es_actual": es_actual,
        }

    def test_dos_vueltas_al_mismo_site_se_suman_en_una(self):
        historial = [
            self._fila("Vista Hermosa", "2026-08-22", "2026-08-22", 1),
            self._fila("Guamal", "2026-08-24", "2026-08-24", 1),
            self._fila("Vista Hermosa", "2026-08-26", "2026-09-04", 10),
        ]

        resultado = main._unificar_por_site(historial)

        assert len(resultado) == 2
        vista_hermosa = next(f for f in resultado if f["site"] == "Vista Hermosa")
        assert vista_hermosa["dias"] == 11
        assert vista_hermosa["fecha_inicio"] == "2026-08-22"
        assert vista_hermosa["fecha_fin"] == "2026-09-04"

    def test_queda_ordenado_por_primera_aparicion(self):
        historial = [
            self._fila("Guamal", "2026-08-24", "2026-08-24", 1),
            self._fila("Vista Hermosa", "2026-08-22", "2026-08-22", 1),
        ]

        resultado = main._unificar_por_site(historial)

        assert [f["site"] for f in resultado] == ["Vista Hermosa", "Guamal"]

    def test_si_alguna_vuelta_es_actual_la_fusion_queda_actual(self):
        historial = [
            self._fila("Piedecuesta", "2026-08-10", "2026-08-11", 2, es_actual=False),
            self._fila("Piedecuesta", "2026-08-20", "2026-09-05", 16, es_actual=True),
        ]

        resultado = main._unificar_por_site(historial)

        assert len(resultado) == 1
        assert resultado[0]["dias"] == 18
        assert resultado[0]["es_actual"] is True

    def test_sites_distintos_no_se_tocan(self):
        historial = [
            self._fila("A", "2026-08-01", "2026-08-05", 5),
            self._fila("B", "2026-08-06", "2026-08-10", 5),
        ]

        resultado = main._unificar_por_site(historial)

        assert resultado == historial
