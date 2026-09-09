package com.monitoreo.processing.service;

import com.monitoreo.processing.exception.InvalidStationCodeException;

import java.util.regex.Pattern;

public final class StationCodeValidator {
    private static final Pattern PATTERN = Pattern.compile("^ST-[A-Z0-9]+(?:-[A-Z0-9]+)*-[0-9]+$");

    private StationCodeValidator() { }

    public static void requireValid(String stationCode) {
        if (stationCode == null || stationCode.length() > 50 || !PATTERN.matcher(stationCode).matches()) {
            throw new InvalidStationCodeException();
        }
    }
}
