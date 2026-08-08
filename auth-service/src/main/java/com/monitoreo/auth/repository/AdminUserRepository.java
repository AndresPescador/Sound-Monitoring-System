package com.monitoreo.auth.repository;

import com.monitoreo.auth.entity.AdminUser;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface AdminUserRepository extends JpaRepository<AdminUser, UUID> {

    Optional<AdminUser> findByUsernameAndActiveTrue(String username);

    boolean existsByUsername(String username);
}
