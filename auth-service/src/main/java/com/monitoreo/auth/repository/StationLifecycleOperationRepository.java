package com.monitoreo.auth.repository;

import com.monitoreo.auth.entity.StationLifecycleOperation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface StationLifecycleOperationRepository extends JpaRepository<StationLifecycleOperation, UUID> {
    List<StationLifecycleOperation> findTop20ByStatusInAndNextAttemptAtLessThanEqualOrderByCreatedAtAsc(
            List<String> statuses, OffsetDateTime now);
    List<StationLifecycleOperation> findByStatusInOrderByUpdatedAtDesc(List<String> statuses);
    Optional<StationLifecycleOperation> findFirstByStationCodeAndOperationTypeAndStatusInOrderByCreatedAtDesc(
            String stationCode, String operationType, List<String> statuses);
}
