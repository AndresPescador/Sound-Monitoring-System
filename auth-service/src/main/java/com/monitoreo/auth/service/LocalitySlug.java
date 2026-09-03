package com.monitoreo.auth.service;

import com.monitoreo.auth.exception.InvalidLocalityException;

import java.text.Normalizer;
import java.util.Locale;

/** Normaliza localidades para los códigos de estación sin alterar su nombre visible. */
public final class LocalitySlug {

    public static final int MAX_SLUG_LENGTH = 44;

    private LocalitySlug() {
    }

    public static String displayName(String locality) {
        String normalized = locality == null ? "" : locality.trim();
        if (normalized.isBlank()) {
            throw new InvalidLocalityException("La localidad es requerida.");
        }
        return normalized;
    }

    public static String from(String locality) {
        String displayName = displayName(locality);
        String slug = Normalizer.normalize(displayName, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replaceAll("[^A-Za-z0-9]+", "-")
                .replaceAll("^-+|-+$", "")
                .toUpperCase(Locale.ROOT);

        if (slug.isBlank()) {
            throw new InvalidLocalityException("La localidad debe incluir letras o números.");
        }
        if (slug.length() > MAX_SLUG_LENGTH) {
            throw new InvalidLocalityException(
                    "La localidad es demasiado larga para generar un código de estación.");
        }
        return slug;
    }
}
