package com.monitoreo.auth.domain;

import com.monitoreo.auth.exception.InvalidLocalityException;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

public enum BogotaLocality {
    ANTONIO_NARINO("Antonio Nariño", "ANTONIO-NARINO"),
    BARRIOS_UNIDOS("Barrios Unidos", "BARRIOS-UNIDOS"),
    BOSA("Bosa", "BOSA"),
    CHAPINERO("Chapinero", "CHAPINERO"),
    CIUDAD_BOLIVAR("Ciudad Bolívar", "CIUDAD-BOLIVAR"),
    ENGATIVA("Engativá", "ENGATIVA"),
    FONTIBON("Fontibón", "FONTIBON"),
    KENNEDY("Kennedy", "KENNEDY"),
    LA_CANDELARIA("La Candelaria", "LA-CANDELARIA"),
    LOS_MARTIRES("Los Mártires", "LOS-MARTIRES"),
    PUENTE_ARANDA("Puente Aranda", "PUENTE-ARANDA"),
    RAFAEL_URIBE_URIBE("Rafael Uribe Uribe", "RAFAEL-URIBE-URIBE"),
    SAN_CRISTOBAL("San Cristóbal", "SAN-CRISTOBAL"),
    SANTA_FE("Santa Fe", "SANTA-FE"),
    SUBA("Suba", "SUBA"),
    SUMAPAZ("Sumapaz", "SUMAPAZ"),
    TEUSAQUILLO("Teusaquillo", "TEUSAQUILLO"),
    TUNJUELITO("Tunjuelito", "TUNJUELITO"),
    USAQUEN("Usaquén", "USAQUEN"),
    USME("Usme", "USME");

    private static final Map<String, BogotaLocality> BY_NORMALIZED_NAME =
            Arrays.stream(values()).collect(Collectors.toUnmodifiableMap(
                    locality -> normalize(locality.officialName), Function.identity()));

    private final String officialName;
    private final String slug;

    BogotaLocality(String officialName, String slug) {
        this.officialName = officialName;
        this.slug = slug;
    }

    public String officialName() {
        return officialName;
    }

    public String slug() {
        return slug;
    }

    public static BogotaLocality from(String value) {
        BogotaLocality locality = value == null ? null : BY_NORMALIZED_NAME.get(normalize(value));
        if (locality == null) {
            throw new InvalidLocalityException();
        }
        return locality;
    }

    private static String normalize(String value) {
        return Normalizer.normalize(value.trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replaceAll("[^A-Za-z0-9]+", " ")
                .trim()
                .replaceAll("\\s+", " ")
                .toUpperCase(Locale.ROOT);
    }
}
