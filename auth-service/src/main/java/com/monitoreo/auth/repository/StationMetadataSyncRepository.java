package com.monitoreo.auth.repository;

import com.monitoreo.auth.entity.StationMetadataSync;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StationMetadataSyncRepository extends JpaRepository<StationMetadataSync, UUID> {
    List<StationMetadataSync> findTop20ByStatusInAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
            List<String> statuses, OffsetDateTime now);
    List<StationMetadataSync> findByStatusInOrderByUpdatedAtDesc(List<String> statuses);
    Optional<StationMetadataSync> findFirstByStationCodeOrderByMetadataVersionDesc(String stationCode);
    Optional<StationMetadataSync> findFirstByStationCodeAndStatusInOrderByMetadataVersionDesc(
            String stationCode, List<String> statuses);
    List<StationMetadataSync> findByStationCodeAndStatusIn(String stationCode, List<String> statuses);
}
