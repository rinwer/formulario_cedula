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


class TestUnificarTramosHistoricos:
    """Cubre el segundo bug real: el lider vuelve al MISMO site despues
    de una interrupcion (otro site de un solo dia) y eso no debe contar
    como dos sites distintos en el historico."""

    def _stint(self, trabajo_id, site, inicio, fin, dias, porcentaje, es_actual=False):
        return {
            "trabajo_id": trabajo_id,
            "site": site,
            "zona": "Oriente",
            "fecha_inicio": inicio,
            "fecha_fin": fin,
            "dias": dias,
            "porcentaje_final": porcentaje,
            "es_actual": es_actual,
        }

    def test_dos_vueltas_al_mismo_site_se_suman_en_una(self):
        stints = [
            self._stint("A", "Vista Hermosa", "2026-08-22", "2026-08-22", 1, 8),
            self._stint("B", "Guamal", "2026-08-24", "2026-08-24", 1, 100),
            self._stint("A", "Vista Hermosa", "2026-08-26", "2026-09-04", 10, 100),
            self._stint("C", "Santo Domingo", "2026-09-05", "2026-09-05", 1, 0, es_actual=True),
        ]

        resultado = main._unificar_tramos_historicos(stints)

        assert len(resultado) == 3
        vista_hermosa = next(s for s in resultado if s["trabajo_id"] == "A")
        assert vista_hermosa["dias"] == 11
        assert vista_hermosa["fecha_inicio"] == "2026-08-22"
        assert vista_hermosa["fecha_fin"] == "2026-09-04"
        # El % vigente es el de la vuelta mas reciente, no el de la primera.
        assert vista_hermosa["porcentaje_final"] == 100

    def test_queda_ordenado_por_fecha_de_inicio(self):
        stints = [
            self._stint("B", "Guamal", "2026-08-24", "2026-08-24", 1, 100),
            self._stint("A", "Vista Hermosa", "2026-08-22", "2026-08-22", 1, 8),
        ]

        resultado = main._unificar_tramos_historicos(stints)

        assert [s["trabajo_id"] for s in resultado] == ["A", "B"]

    def test_el_tramo_actual_nunca_se_mezcla_con_uno_historico_del_mismo_site(self):
        # Mismo trabajo_id en un tramo historico cerrado y en el actual
        # (el lider volvio al site en el que ya habia estado antes):
        # deben quedar como dos entradas separadas, no fusionarse.
        stints = [
            self._stint("A", "Piedecuesta-2", "2026-08-10", "2026-08-11", 2, 0),
            self._stint("A", "Piedecuesta-2", "2026-08-20", "2026-09-05", 16, 74, es_actual=True),
        ]

        resultado = main._unificar_tramos_historicos(stints)

        assert len(resultado) == 2
        assert sum(1 for s in resultado if s["es_actual"]) == 1
        actual = next(s for s in resultado if s["es_actual"])
        assert actual["dias"] == 16

    def test_sin_historicos_solo_deja_el_actual(self):
        stints = [self._stint("A", "Site", "2026-09-01", "2026-09-01", 1, 0, es_actual=True)]

        resultado = main._unificar_tramos_historicos(stints)

        assert resultado == stints
