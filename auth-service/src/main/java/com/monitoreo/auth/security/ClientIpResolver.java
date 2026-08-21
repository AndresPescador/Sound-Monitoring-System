package com.monitoreo.auth.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.web.util.matcher.IpAddressMatcher;
import org.springframework.stereotype.Component;

import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Resuelve la IP del cliente sin confiar ciegamente en cabeceras HTTP.
 *
 * X-Forwarded-For solo se acepta cuando la conexión TCP proviene de una de las
 * subredes configuradas como proxy confiable. El gateway Docker envía una única
 * IP canónica; las listas o valores no numéricos se rechazan.
 */
@Component
public class ClientIpResolver {

    private static final int MAX_IP_LITERAL_LENGTH = 45;
    private static final Pattern IPV4_LITERAL =
            Pattern.compile("^[0-9]{1,3}(?:\\.[0-9]{1,3}){3}$");
    private static final Pattern IPV6_LITERAL =
            Pattern.compile("^[0-9A-Fa-f:.]+$");

    private final List<IpAddressMatcher> trustedProxies;

    public ClientIpResolver(
            @Value("${client-ip.trusted-proxies:}") String trustedProxyCidrs) {
        this.trustedProxies = Arrays.stream(trustedProxyCidrs.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(IpAddressMatcher::new)
                .toList();
    }

    public String resolve(HttpServletRequest request) {
        String remoteAddress = canonicalize(request.getRemoteAddr()).orElse("unknown");
        if (!isTrustedProxy(remoteAddress)) {
            return remoteAddress;
        }

        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded == null || forwarded.isBlank() || forwarded.contains(",")) {
            return remoteAddress;
        }
        return canonicalize(forwarded).orElse(remoteAddress);
    }

    private boolean isTrustedProxy(String address) {
        if ("unknown".equals(address)) {
            return false;
        }
        return trustedProxies.stream().anyMatch(matcher -> matcher.matches(address));
    }

    private Optional<String> canonicalize(String rawAddress) {
        if (rawAddress == null) {
            return Optional.empty();
        }
        String address = rawAddress.trim();
        if (address.isEmpty() || address.length() > MAX_IP_LITERAL_LENGTH) {
            return Optional.empty();
        }

        if (address.contains(":")) {
            if (!IPV6_LITERAL.matcher(address).matches()) {
                return Optional.empty();
            }
            try {
                InetAddress parsed = InetAddress.getByName(address);
                return parsed instanceof Inet6Address
                        ? Optional.of(parsed.getHostAddress())
                        : Optional.empty();
            } catch (UnknownHostException ex) {
                return Optional.empty();
            }
        }

        if (!IPV4_LITERAL.matcher(address).matches()) {
            return Optional.empty();
        }
        String[] octets = address.split("\\.");
        for (String octet : octets) {
            if (Integer.parseInt(octet) > 255) {
                return Optional.empty();
            }
        }
        return Optional.of(Arrays.stream(octets)
                .map(Integer::parseInt)
                .map(String::valueOf)
                .reduce((left, right) -> left + "." + right)
                .orElseThrow());
    }
}
