package com.monitoreo.auth.repository;

import com.monitoreo.auth.entity.AuthAuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AuthAuditLogRepository extends JpaRepository<AuthAuditLog, Long> {

}