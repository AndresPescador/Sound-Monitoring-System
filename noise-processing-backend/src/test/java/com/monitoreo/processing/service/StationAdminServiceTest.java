package com.monitoreo.processing.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.monitoreo.processing.dto.RegisterStationRequest;
import com.monitoreo.processing.dto.RegisterStationResponse;
import com.monitoreo.processing.dto.StationAdminResponse;
import com.monitoreo.processing.dto.UpdateStationRequest;
import com.monitoreo.processing.entity.Station;
import com.monitoreo.processing.exception.StationAlreadyExistsException;
import com.monitoreo.processing.exception.StationNotFoundException;
import com.monitoreo.processing.repository.StationRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StationAdminServiceTest {

    @Mock private StationRepository stationRepository;

    @InjectMocks private StationAdminService service;

    @Test
    void registerStationPersistsPublicName() throws Exception {
        RegisterStationRequest request = new ObjectMapper().readValue("""
                {
                  "stationCode": "ST-CHAPINERO-01",
                  "name": "Nombre controlado por el cliente",
                  "locality": "Chapinero",
                  "latitude": 4.65,
                  "longitude": -74.06
                }
                """, RegisterStationRequest.class);
        when(stationRepository.existsByStationCode("ST-CHAPINERO-01")).thenReturn(false);

        RegisterStationResponse response = service.registerStation(request);

        ArgumentCaptor<Station> stationCaptor = ArgumentCaptor.forClass(Station.class);
        verify(stationRepository).save(stationCaptor.capture());
        assertEquals("Nombre controlado por el cliente", stationCaptor.getValue().getName());
        assertEquals("Nombre controlado por el cliente", response.getName());
    }

    @Test
    void updateStationChangesNameAndPreservesLocalityAndCode() throws Exception {
        Station station = new Station();
        station.setStationCode("ST-EXISTENTE-01");
        station.setName("Nombre histórico");
        station.setLocality("Usaquén");
        station.setLatitude(4.70);
        station.setLongitude(-74.03);
        UpdateStationRequest request = new ObjectMapper().readValue("""
                {
                  "name": "Nombre actualizado",
                  "locality": "Chapinero",
                  "description": "Actualizada",
                  "address": "Calle 1",
                  "latitude": 4.66,
                  "longitude": -74.07
                }
                """, UpdateStationRequest.class);
        when(stationRepository.findByStationCode("ST-EXISTENTE-01")).thenReturn(Optional.of(station));

        StationAdminResponse response = service.updateStation("ST-EXISTENTE-01", request);

        assertEquals("Nombre actualizado", station.getName());
        assertEquals("Nombre actualizado", response.getName());
        assertEquals("Usaquén", response.getLocality());
    }

    @Test
    void refusesDuplicateStationCodes() throws Exception {
        RegisterStationRequest request = new ObjectMapper().readValue("""
                {"stationCode":"ST-EXISTENTE-01","name":"Estación existente","locality":"Chapinero"}
                """, RegisterStationRequest.class);
        when(stationRepository.existsByStationCode("ST-EXISTENTE-01")).thenReturn(true);

        org.junit.jupiter.api.Assertions.assertThrows(
                StationAlreadyExistsException.class,
                () -> service.registerStation(request)
        );
        org.mockito.Mockito.verify(stationRepository, org.mockito.Mockito.never()).save(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void supportsListGetStatusAndDeleteOperations() {
        Station station = new Station();
        station.setStationCode("ST-TEST-01");
        station.setName("Estación ST-TEST-01");
        station.setLocality("Chapinero");
        station.setLatitude(4.65);
        station.setLongitude(-74.06);
        when(stationRepository.findAll()).thenReturn(List.of(station));
        when(stationRepository.findByStationCode("ST-TEST-01")).thenReturn(Optional.of(station));

        assertEquals(1, service.listStations().size());
        assertEquals("ST-TEST-01", service.getStation("ST-TEST-01").getStationCode());
        assertEquals("ST-TEST-01", service.changeStatus("ST-TEST-01", false).getStationCode());
        service.deleteStation("ST-TEST-01");
        org.mockito.Mockito.verify(stationRepository).delete(station);
    }

    @Test
    void reportsMissingStationForAdminOperations() {
        when(stationRepository.findByStationCode("ST-MISSING-01")).thenReturn(Optional.empty());

        org.junit.jupiter.api.Assertions.assertThrows(
                StationNotFoundException.class,
                () -> service.getStation("ST-MISSING-01")
        );
        org.junit.jupiter.api.Assertions.assertThrows(
                StationNotFoundException.class,
                () -> service.changeStatus("ST-MISSING-01", true)
        );
    }
}
