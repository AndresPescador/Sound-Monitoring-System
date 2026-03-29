package com.monitoreo.auth.repository;

import com.monitoreo.auth.entity.ApiToken;
import com.monitoreo.auth.entity.RegisteredStation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

public interface ApiTokenRepository extends JpaRepository<ApiToken, UUID> {

    Optional<ApiToken> findByJti(String jti);

    @Modifying
    @Query("""
            UPDATE ApiToken t
            SET t.revoked = true,
                t.revokedAt = :revokedAt,
                t.revocationReason = :reason
            WHERE t.station = :station
              AND t.revoked = false
            """)
    int revokeAllActiveTokensForStation(
            @Param("station") RegisteredStation station,
            @Param("revokedAt") OffsetDateTime revokedAt,
            @Param("reason") String reason
    );
}
