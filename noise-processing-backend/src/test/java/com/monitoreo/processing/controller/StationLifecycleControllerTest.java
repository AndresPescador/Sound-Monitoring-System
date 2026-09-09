package com.monitoreo.processing.controller;

import com.monitoreo.processing.dto.InternalStationProvisionRequest;
import com.monitoreo.processing.exception.ForbiddenException;
import com.monitoreo.processing.security.AdminTokenValidator;
import com.monitoreo.processing.service.StationAdminService;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class StationLifecycleControllerTest {

    private StationAdminService stationAdminService;
    private AdminTokenValidator tokenValidator;
    private InternalStationSyncController internalController;
    private StationAdminController adminController;

    @BeforeEach
    void setUp() {
        stationAdminService = mock(StationAdminService.class);
        tokenValidator = mock(AdminTokenValidator.class);
        internalController = new InternalStationSyncController(stationAdminService);
        ReflectionTestUtils.setField(internalController, "syncToken", "internal-test-token");
        adminController = new StationAdminController(stationAdminService, tokenValidator);
    }

    @Test
    void rejectsAnIncorrectInternalTokenBeforeProvisioning() {
        InternalStationProvisionRequest body = new InternalStationProvisionRequest();

        assertThrows(ForbiddenException.class, () -> internalController.provisionStation(
                "ST-SUBA-01", "incorrect-token", body));

        verify(stationAdminService, never()).provisionStation("ST-SUBA-01", body);
    }

    @Test
    void acceptsTheInternalTokenForIdempotentLifecycleCalls() {
        InternalStationProvisionRequest body = new InternalStationProvisionRequest();

        assertEquals(HttpStatus.NO_CONTENT, internalController.provisionStation(
                "ST-SUBA-01", "internal-test-token", body).getStatusCode());
        assertEquals(HttpStatus.NO_CONTENT, internalController.deleteStation(
                "ST-SUBA-01", "internal-test-token").getStatusCode());

        verify(stationAdminService).provisionStation("ST-SUBA-01", body);
        verify(stationAdminService).deleteStationIfPresent("ST-SUBA-01");
    }

    @Test
    void legacyPublicCreationAndDeletionReturnGone() {
        HttpServletRequest request = mock(HttpServletRequest.class);

        assertEquals(HttpStatus.GONE, adminController.registerStation(request).getStatusCode());
        assertEquals(HttpStatus.GONE,
                adminController.deleteStation("ST-SUBA-01", request).getStatusCode());

        verify(tokenValidator, org.mockito.Mockito.times(2)).requireAdmin(request);
        verify(stationAdminService, never()).deleteStationIfPresent("ST-SUBA-01");
    }
}
