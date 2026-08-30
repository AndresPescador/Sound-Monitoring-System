package com.monitoreo.processing.controller;

import com.monitoreo.processing.dto.MeasurementRequest;
import com.monitoreo.processing.service.MeasurementService;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MeasurementControllerTest {

    private final MeasurementService service = mock(MeasurementService.class);
    private final MeasurementController controller = new MeasurementController(service);

    @Test
    void mapsInsertedAndDuplicateResultsToTheirHttpContracts() {
        MeasurementRequest request = new MeasurementRequest();
        request.setStationCode("ST-TEST-01");
        request.setTimestamp(OffsetDateTime.parse("2026-08-30T15:00:00Z"));

        when(service.process(request)).thenReturn(MeasurementService.ProcessResult.INSERTED);
        var inserted = controller.ingestMeasurement(request);
        assertEquals(201, inserted.getStatusCode().value());
        assertEquals("inserted", inserted.getBody().get("result"));

        when(service.process(request)).thenReturn(MeasurementService.ProcessResult.DUPLICATE);
        var duplicate = controller.ingestMeasurement(request);
        assertEquals(200, duplicate.getStatusCode().value());
        assertEquals("duplicate", duplicate.getBody().get("result"));
    }

    @Test
    void exposesHealthContract() {
        var response = controller.health();
        assertEquals(200, response.getStatusCode().value());
        assertEquals("noise-processing-backend", response.getBody().get("service"));
    }
}
