#!/usr/bin/env bash

# DNS SSL 证书命令行助手
# 基于 acme.sh 完成 Let's Encrypt 证书申请、续期、安装和 Nginx 安全重载。

set -Eeuo pipefail

VERSION="1.1.0"
PROGRAM_NAME="DNS SSL 证书命令行助手"

PROFILE_DIR="${DNS_SSL_PROFILE_DIR:-/etc/dns-ssl-manager}"
BACKUP_ROOT="${DNS_SSL_BACKUP_DIR:-/var/backups/dns-ssl-manager}"
ACME_HOME="${DNS_SSL_ACME_HOME:-${HOME:-/root}/.acme.sh}"
ACME_CONFIG_HOME=""
ACME_BIN=""

BASE_DOMAIN=""
CERT_SCOPE="single"
INCLUDE_APEX="1"
EMAIL=""
CA_ENV="production"
CA_SERVER="letsencrypt"
KEY_LENGTH="2048"
VALIDATION_METHOD="nginx"
WEBROOT="/var/www/html"
DNS_PLUGIN=""
INSTALL_TO_NGINX="1"
CERT_FILE=""
KEY_FILE=""
NGINX_CONFIG_FILE=""
NGINX_SERVER_NAMES=""
NGINX_CERT_FILE=""
NGINX_KEY_FILE=""
NGINX_DETECTED="0"
RENEW_DAYS="30"
FORCE_ISSUE="0"
PRIMARY_IDENTIFIER=""
declare -a DOMAINS=()

if [[ -t 1 && "${NO_COLOR:-}" == "" ]]; then
    C_RESET=$'\033[0m'
    C_BOLD=$'\033[1m'
    C_BLUE=$'\033[34m'
    C_GREEN=$'\033[32m'
    C_YELLOW=$'\033[33m'
    C_RED=$'\033[31m'
    C_DIM=$'\033[2m'
else
    C_RESET=""
    C_BOLD=""
    C_BLUE=""
    C_GREEN=""
    C_YELLOW=""
    C_RED=""
    C_DIM=""
fi

info() { printf '%sℹ%s  %s\n' "$C_BLUE" "$C_RESET" "$*"; }
success() { printf '%s✓%s  %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s!%s  %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
error() { printf '%s✗%s  %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
die() { error "$*"; exit 1; }

rule() {
    printf '%s\n' "${C_DIM}────────────────────────────────────────────────────────────${C_RESET}"
}

header() {
    command -v clear >/dev/null 2>&1 && clear || true
    printf '%s%s%s\n' "$C_BOLD" "$PROGRAM_NAME" "$C_RESET"
    printf '%s%s%s\n' "$C_DIM" "单域名 / 泛域名 · HTTP-01 / DNS-01 · 安全更换 Nginx 证书" "$C_RESET"
    rule
}

pause_screen() {
    printf '\n'
    read -r -p "按 Enter 返回..." _ || true
}

prompt_value() {
    local label=$1
    local default_value=${2:-}
    local value=""

    if [[ -n "$default_value" ]]; then
        read -r -p "$label [$default_value]: " value || true
        printf '%s' "${value:-$default_value}"
    else
        while [[ -z "$value" ]]; do
            read -r -p "$label: " value || true
        done
        printf '%s' "$value"
    fi
}

confirm() {
    local message=$1
    local default_answer=${2:-yes}
    local hint="[Y/n]"
    local answer=""

    [[ "$default_answer" == "no" ]] && hint="[y/N]"
    read -r -p "$message $hint " answer || true
    answer=${answer,,}

    if [[ -z "$answer" ]]; then
        [[ "$default_answer" == "yes" ]]
        return
    fi
    [[ "$answer" == "y" || "$answer" == "yes" || "$answer" == "是" ]]
}

choose() {
    local prompt=$1
    local max=$2
    local default_choice=${3:-1}
    local choice=""

    while true; do
        read -r -p "$prompt [$default_choice]: " choice || true
        choice=${choice:-$default_choice}
        if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 0 && choice <= max )); then
            printf '%s' "$choice"
            return
        fi
        error "请输入 0-$max 之间的数字。"
    done
}

print_command() {
    printf '%s$' "$C_DIM"
    printf ' %q' "$@"
    printf '%s\n' "$C_RESET"
}

is_valid_domain() {
    local domain=${1,,}
    [[ ${#domain} -le 253 ]] || return 1
    [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)$ ]]
}

is_valid_email() {
    [[ "$1" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

is_safe_absolute_path() {
    local path=$1
    [[ "$path" == /* ]] || return 1
    [[ "$path" != "/" ]] || return 1
    [[ "$path" != *$'\n'* && "$path" != *$'\r'* ]] || return 1
    [[ "$path" != *'$'* && "$path" != *'`'* ]] || return 1
    [[ "$path" != *"/../"* && "$path" != */.. ]] || return 1
}

require_root_for_install() {
    if [[ "$INSTALL_TO_NGINX" == "1" && ${EUID:-$(id -u)} -ne 0 ]]; then
        die "安装到 Nginx 需要 root 权限，请使用 sudo bash $0。"
    fi
}

find_acme_sh() {
    local candidate=""

    if [[ -n "${DNS_SSL_ACME_SH:-}" && -x "$DNS_SSL_ACME_SH" ]]; then
        ACME_BIN=$DNS_SSL_ACME_SH
        return 0
    fi

    candidate=$(command -v acme.sh 2>/dev/null || true)
    if [[ -n "$candidate" && -x "$candidate" ]]; then
        ACME_BIN=$candidate
        return 0
    fi

    for candidate in "$ACME_HOME/acme.sh" "${HOME:-/root}/.acme.sh/acme.sh" "/root/.acme.sh/acme.sh"; do
        if [[ -x "$candidate" ]]; then
            ACME_BIN=$candidate
            ACME_HOME=$(dirname "$candidate")
            return 0
        fi
    done
    return 1
}

refresh_acme_config_home() {
    local config_root=${DNS_SSL_ACME_CONFIG_HOME:-$ACME_HOME}
    if [[ "$CA_ENV" == "staging" ]]; then
        ACME_CONFIG_HOME="${config_root%/}/staging"
    else
        ACME_CONFIG_HOME=$config_root
    fi
}

install_acme_sh() {
    local installer=""

    header
    warn "未检测到 acme.sh。它负责 ACME 协议、账户密钥和自动续期。"
    info "安装来源：https://get.acme.sh（acme.sh 官方安装器）"
    confirm "现在安装 acme.sh？" yes || return 1

    while ! is_valid_email "$EMAIL"; do
        EMAIL=$(prompt_value "Let's Encrypt 账户邮箱")
        is_valid_email "$EMAIL" || error "邮箱格式不正确。"
    done

    installer=$(mktemp "${TMPDIR:-/tmp}/dns-ssl-acme-installer.XXXXXX")

    if command -v curl >/dev/null 2>&1; then
        if ! curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
            https://get.acme.sh --output "$installer"; then
            rm -f -- "$installer"
            die "下载 acme.sh 官方安装器失败。"
        fi
    elif command -v wget >/dev/null 2>&1; then
        if ! wget --https-only --output-document="$installer" https://get.acme.sh; then
            rm -f -- "$installer"
            die "下载 acme.sh 官方安装器失败。"
        fi
    else
        rm -f -- "$installer"
        die "安装 acme.sh 需要 curl 或 wget。"
    fi

    if ! sh "$installer" email="$EMAIL"; then
        rm -f -- "$installer"
        die "acme.sh 安装失败。"
    fi
    rm -f -- "$installer"
    find_acme_sh || die "acme.sh 安装完成但未找到可执行文件，请重新打开终端后再试。"
    success "acme.sh 已安装：$ACME_BIN"
}

ensure_acme_sh() {
    find_acme_sh && return 0
    install_acme_sh
}

ensure_openssl() {
    command -v openssl >/dev/null 2>&1 || die "缺少 openssl，请先通过系统包管理器安装。"
}

certificate_end_date() {
    openssl x509 -in "$1" -noout -enddate 2>/dev/null | sed 's/^notAfter=//'
}

certificate_days_left() {
    local cert_file=$1
    local end_date end_epoch now_epoch

    end_date=$(certificate_end_date "$cert_file") || return 1
    [[ -n "$end_date" ]] || return 1
    end_epoch=$(date -d "$end_date" +%s 2>/dev/null) || return 1
    now_epoch=$(date +%s)
    printf '%s' "$(( (end_epoch - now_epoch + 86399) / 86400 ))"
}

show_certificate_file() {
    local cert_file=$1
    local title=${2:-本机证书}
    local days=""
    local subject issuer start_date end_date serial

    rule
    printf '%s%s%s\n' "$C_BOLD" "$title" "$C_RESET"
    printf '文件：%s\n' "$cert_file"
    if [[ ! -s "$cert_file" ]]; then
        warn "证书文件不存在或为空。"
        rule
        return 1
    fi
    if ! openssl x509 -in "$cert_file" -noout >/dev/null 2>&1; then
        error "不是可识别的 PEM 证书。"
        rule
        return 1
    fi

    subject=$(openssl x509 -in "$cert_file" -noout -subject 2>/dev/null | sed 's/^subject=//')
    issuer=$(openssl x509 -in "$cert_file" -noout -issuer 2>/dev/null | sed 's/^issuer=//')
    start_date=$(openssl x509 -in "$cert_file" -noout -startdate 2>/dev/null | sed 's/^notBefore=//')
    end_date=$(certificate_end_date "$cert_file")
    serial=$(openssl x509 -in "$cert_file" -noout -serial 2>/dev/null | sed 's/^serial=//')
    printf '颁发给：%s\n' "$subject"
    printf '颁发者：%s\n' "$issuer"
    printf '生效时间：%s\n' "$start_date"
    printf '过期时间：%s\n' "$end_date"
    printf '序列号：%s\n' "$serial"
    days=$(certificate_days_left "$cert_file" || true)
    if [[ -n "$days" ]]; then
        if (( days < 0 )); then
            error "已过期 $((-days)) 天"
        elif (( days <= RENEW_DAYS )); then
            warn "剩余 $days 天，已进入续期窗口（$RENEW_DAYS 天）。"
        else
            success "剩余 $days 天，暂时无需更换。"
        fi
    fi
    rule
}

certificate_is_fresh() {
    local cert_file=$1
    [[ -s "$cert_file" ]] || return 1
    openssl x509 -in "$cert_file" -noout -checkend "$((RENEW_DAYS * 86400))" >/dev/null 2>&1
}

certificate_matches_key() {
    local cert_file=$1
    local key_file=$2
    local cert_hash key_hash

    cert_hash=$(openssl x509 -in "$cert_file" -pubkey -noout 2>/dev/null \
        | openssl pkey -pubin -outform DER 2>/dev/null \
        | openssl dgst -sha256 2>/dev/null) || return 1
    key_hash=$(openssl pkey -in "$key_file" -pubout -outform DER 2>/dev/null \
        | openssl dgst -sha256 2>/dev/null) || return 1
    [[ -n "$cert_hash" && "$cert_hash" == "$key_hash" ]]
}

certificate_covers_domain() {
    local cert_file=$1
    local domain=$2
    local wildcard=""
    local san_names=""

    # OpenSSL 1.1.1+ 可以直接校验主机名；CentOS 7 的 OpenSSL 1.0.2 使用下方兼容逻辑。
    if openssl x509 -help 2>&1 | grep -q -- '-checkhost'; then
        if openssl x509 -in "$cert_file" -noout -checkhost "$domain" >/dev/null 2>&1; then
            return 0
        fi
    fi

    san_names=$(openssl x509 -in "$cert_file" -noout -text 2>/dev/null \
        | tr ',' '\n' \
        | sed -n 's/^[[:space:]]*DNS://p') || return 1
    printf '%s\n' "$san_names" | grep -Fx -- "$domain" >/dev/null && return 0

    if [[ "$domain" == *.* ]]; then
        wildcard="*.${domain#*.}"
        printf '%s\n' "$san_names" | grep -Fx -- "$wildcard" >/dev/null && return 0
    fi
    return 1
}

certificate_fingerprint() {
    openssl x509 -in "$1" -noout -fingerprint -sha256 2>/dev/null | sed 's/^.*=//'
}

parse_nginx_config_dump() {
    local domain=$1
    local dump_file=$2
    local score config root cert key names
    local detected_config="" detected_root="" detected_cert="" detected_key="" detected_names=""
    local cert_config=""

    while IFS='|' read -r score config root cert key names; do
        [[ -n "$score" ]] || continue
        [[ -z "$detected_config" && -n "$config" ]] && detected_config=$config
        [[ -z "$detected_root" && -n "$root" ]] && detected_root=$root
        [[ -z "$detected_names" && -n "$names" ]] && detected_names=$names
        if [[ -z "$detected_cert" && -n "$cert" && -n "$key" ]]; then
            detected_cert=$cert
            detected_key=$key
            cert_config=$config
        fi
    done < <(
        awk -v target="$domain" '
            function directive_value(line, directive, value) {
                value = line
                sub("^[[:space:]]*" directive "[[:space:]]+", "", value)
                sub("[[:space:]]*;[[:space:]]*$", "", value)
                gsub(/^"|"$/, "", value)
                return value
            }
            function names_score(line, raw, item_count, item_index, name, suffix, result) {
                raw = directive_value(line, "server_name")
                item_count = split(raw, values, /[[:space:]]+/)
                result = 0
                for (item_index = 1; item_index <= item_count; item_index++) {
                    name = values[item_index]
                    if (name == target && result < 30) {
                        result = 30
                    } else if (substr(name, 1, 2) == "*.") {
                        suffix = substr(name, 2)
                        if (length(target) > length(suffix) && substr(target, length(target) - length(suffix) + 1) == suffix && result < 20) {
                            result = 20
                        }
                    } else if (substr(name, 1, 1) == ".") {
                        suffix = substr(name, 2)
                        if ((target == suffix || substr(target, length(target) - length(suffix)) == "." suffix) && result < 15) {
                            result = 15
                        }
                    }
                }
                return result
            }
            /^# configuration file / {
                current_config = $0
                sub(/^# configuration file /, "", current_config)
                sub(/:$/, "", current_config)
                next
            }
            {
                line = $0
                sub(/[[:space:]]*#.*/, "", line)
                if (!inside && line ~ /^[[:space:]]*server[[:space:]]*\{/) {
                    inside = 1
                    depth = 0
                    block_config = current_config
                    block_root = ""
                    block_cert = ""
                    block_key = ""
                    block_names = ""
                    block_score = 0
                }
                if (inside) {
                    if (line ~ /^[[:space:]]*server_name[[:space:]]+/) {
                        current_score = names_score(line)
                        if (current_score > block_score) block_score = current_score
                        if (block_names == "") block_names = directive_value(line, "server_name")
                    } else if (line ~ /^[[:space:]]*ssl_certificate_key[[:space:]]+/ && block_key == "") {
                        block_key = directive_value(line, "ssl_certificate_key")
                    } else if (line ~ /^[[:space:]]*ssl_certificate[[:space:]]+/ && block_cert == "") {
                        block_cert = directive_value(line, "ssl_certificate")
                    } else if (line ~ /^[[:space:]]*root[[:space:]]+/ && block_root == "") {
                        block_root = directive_value(line, "root")
                    }
                    open_copy = line
                    close_copy = line
                    depth += gsub(/\{/, "", open_copy)
                    depth -= gsub(/\}/, "", close_copy)
                    if (depth <= 0) {
                        if (block_score > 0) {
                            printf "%d|%s|%s|%s|%s|%s\n", block_score, block_config, block_root, block_cert, block_key, block_names
                        }
                        inside = 0
                    }
                }
            }
        ' "$dump_file" | sort -t '|' -k1,1nr
    )

    [[ -n "$cert_config" ]] && detected_config=$cert_config
    [[ -n "$detected_config" || -n "$detected_root" || -n "$detected_cert" ]] || return 1

    NGINX_CONFIG_FILE=$detected_config
    NGINX_SERVER_NAMES=$detected_names
    NGINX_CERT_FILE=$detected_cert
    NGINX_KEY_FILE=$detected_key
    if [[ -n "$detected_root" ]] && is_safe_absolute_path "$detected_root"; then
        WEBROOT=$detected_root
    fi
    if [[ -n "$detected_cert" && -n "$detected_key" ]] \
        && is_safe_absolute_path "$detected_cert" \
        && is_safe_absolute_path "$detected_key"; then
        CERT_FILE=$detected_cert
        KEY_FILE=$detected_key
    fi
    NGINX_DETECTED="1"
}

detect_nginx_context() {
    local domain=$1
    local supplied_dump=${2:-}
    local dump_file="$supplied_dump"
    local owns_dump="0"

    NGINX_DETECTED="0"
    NGINX_CONFIG_FILE=""
    NGINX_SERVER_NAMES=""
    NGINX_CERT_FILE=""
    NGINX_KEY_FILE=""
    if [[ -z "$dump_file" ]]; then
        command -v nginx >/dev/null 2>&1 || return 1
        dump_file=$(mktemp "${TMPDIR:-/tmp}/dns-ssl-nginx-dump.XXXXXX")
        owns_dump="1"
        if ! nginx -T >"$dump_file" 2>&1; then
            rm -f -- "$dump_file"
            return 1
        fi
    fi

    if ! parse_nginx_config_dump "$domain" "$dump_file"; then
        [[ "$owns_dump" == "1" ]] && rm -f -- "$dump_file"
        return 1
    fi
    [[ "$owns_dump" == "1" ]] && rm -f -- "$dump_file"
}

show_nginx_context() {
    rule
    printf '%sNginx 自动识别%s\n' "$C_BOLD" "$C_RESET"
    if [[ "$NGINX_DETECTED" != "1" ]]; then
        warn "没有找到与 $BASE_DOMAIN 匹配的 server 块。"
        rule
        return 1
    fi
    printf '配置文件：  %s\n' "${NGINX_CONFIG_FILE:-未识别}"
    printf 'server_name：%s\n' "${NGINX_SERVER_NAMES:-未识别}"
    printf '站点 root： %s\n' "${WEBROOT:-未识别}"
    printf '证书文件：  %s\n' "${NGINX_CERT_FILE:-未配置}"
    printf '私钥文件：  %s\n' "${NGINX_KEY_FILE:-未配置}"
    rule
}

fetch_live_certificate() {
    local domain=$1
    local output_file=$2

    if command -v timeout >/dev/null 2>&1; then
        timeout 12 openssl s_client -connect "$domain:443" -servername "$domain" -showcerts </dev/null 2>/dev/null \
            | openssl x509 -outform PEM >"$output_file" 2>/dev/null || true
    else
        openssl s_client -connect "$domain:443" -servername "$domain" -showcerts </dev/null 2>/dev/null \
            | openssl x509 -outform PEM >"$output_file" 2>/dev/null || true
    fi
    [[ -s "$output_file" ]] && openssl x509 -in "$output_file" -noout >/dev/null 2>&1
}

query_certificate_status() {
    local domain=${1:-}
    local interactive=${2:-yes}
    local temp_cert=""
    local live_found="0" local_found="0"
    local live_fingerprint="" local_fingerprint=""

    [[ "$interactive" == "yes" ]] && header
    [[ -n "$domain" ]] || domain=$(prompt_value "要查询的域名" "${BASE_DOMAIN:-api.example.com}")
    domain=${domain,,}
    if ! is_valid_domain "$domain"; then
        error "域名格式不正确。"
        [[ "$interactive" == "yes" ]] && pause_screen
        return 1
    fi
    BASE_DOMAIN=$domain
    ensure_openssl
    CERT_FILE=""
    KEY_FILE=""
    WEBROOT="/var/www/html"
    detect_nginx_context "$domain" || true
    if command -v nginx >/dev/null 2>&1 && [[ "$NGINX_DETECTED" != "1" ]]; then
        warn "未读取到本机 Nginx 配置；如需同时检查本机证书路径，请使用 sudo 运行。"
    fi

    temp_cert=$(mktemp "${TMPDIR:-/tmp}/dns-ssl-live-cert.XXXXXX")
    printf '%s证书有效期查询：%s%s\n' "$C_BOLD" "$domain" "$C_RESET"
    if fetch_live_certificate "$domain" "$temp_cert"; then
        live_found="1"
        live_fingerprint=$(certificate_fingerprint "$temp_cert" || true)
        show_certificate_file "$temp_cert" "线上 443 正在使用的证书" || true
    else
        warn "无法读取 $domain:443 的线上证书。"
    fi

    if [[ -n "$CERT_FILE" && -s "$CERT_FILE" ]]; then
        local_found="1"
        local_fingerprint=$(certificate_fingerprint "$CERT_FILE" || true)
        show_certificate_file "$CERT_FILE" "Nginx 配置引用的本机证书" || true
    elif [[ "$NGINX_DETECTED" == "1" ]]; then
        warn "匹配到 Nginx server 块，但没有找到可读取的 ssl_certificate 文件。"
    fi

    if [[ "$live_found" == "1" && "$local_found" == "1" ]]; then
        if [[ -n "$live_fingerprint" && "$live_fingerprint" == "$local_fingerprint" ]]; then
            success "线上证书与 Nginx 配置文件中的证书一致。"
        else
            warn "线上证书与本机配置证书不同：可能尚未 reload，或域名前方存在 CDN/负载均衡。"
        fi
    fi
    rm -f -- "$temp_cert"
    [[ "$interactive" == "yes" ]] && pause_screen
    [[ "$live_found" == "1" || "$local_found" == "1" ]]
}

inspect_local_certificate() {
    local path=""
    header
    path=$(prompt_value "PEM/fullchain 证书路径" "${CERT_FILE:-/etc/nginx/ssl/example.com/fullchain.pem}")
    ensure_openssl
    show_certificate_file "$path" || true
    pause_screen
}

inspect_nginx_configuration() {
    local domain=""
    header
    domain=$(prompt_value "要分析的 Nginx 域名" "${BASE_DOMAIN:-api.example.com}")
    domain=${domain,,}
    is_valid_domain "$domain" || { error "域名格式不正确。"; pause_screen; return; }
    BASE_DOMAIN=$domain
    CERT_FILE=""
    KEY_FILE=""
    WEBROOT="/var/www/html"
    if detect_nginx_context "$domain"; then
        show_nginx_context || true
        if [[ -n "$CERT_FILE" && -s "$CERT_FILE" ]]; then
            show_certificate_file "$CERT_FILE" "Nginx 当前配置证书" || true
        fi
    else
        error "nginx -T 未找到与 $domain 匹配的 server 块，或 Nginx 配置检查失败。"
    fi
    pause_screen
}

build_domain_list() {
    DOMAINS=()
    if [[ "$CERT_SCOPE" == "wildcard" ]]; then
        if [[ "$INCLUDE_APEX" == "1" ]]; then
            DOMAINS+=("$BASE_DOMAIN")
        fi
        DOMAINS+=("*.$BASE_DOMAIN")
    else
        DOMAINS+=("$BASE_DOMAIN")
    fi
    PRIMARY_IDENTIFIER=${DOMAINS[0]}
}

configure_domain() {
    local value=""
    local choice=""
    local previous_domain=$BASE_DOMAIN

    while true; do
        value=$(prompt_value "域名（不要输入 http:// 或路径）" "${BASE_DOMAIN:-api.example.com}")
        value=${value,,}
        value=${value#\*.}
        if is_valid_domain "$value"; then
            BASE_DOMAIN=$value
            break
        fi
        error "域名格式不正确，例如 api.example.com 或 example.com。"
    done

    if [[ -n "$previous_domain" && "$BASE_DOMAIN" != "$previous_domain" ]]; then
        CERT_FILE=""
        KEY_FILE=""
        WEBROOT="/var/www/html"
        NGINX_CONFIG_FILE=""
        NGINX_SERVER_NAMES=""
        NGINX_CERT_FILE=""
        NGINX_KEY_FILE=""
        NGINX_DETECTED="0"
    fi

    printf '\n证书范围：\n  1) 单域名 %s\n  2) 泛域名 *.%s\n' "$BASE_DOMAIN" "$BASE_DOMAIN"
    choice=$(choose "请选择" 2 "$([[ "$CERT_SCOPE" == "wildcard" ]] && echo 2 || echo 1)")
    if [[ "$choice" == "2" ]]; then
        CERT_SCOPE="wildcard"
        confirm "同时把根域名 $BASE_DOMAIN 加入证书？" yes && INCLUDE_APEX="1" || INCLUDE_APEX="0"
    else
        CERT_SCOPE="single"
        INCLUDE_APEX="1"
    fi
    build_domain_list
}

configure_ca() {
    local choice=""
    printf '\nCA 环境：\n  1) Let\x27s Encrypt 生产环境\n  2) Let\x27s Encrypt Staging 测试环境（证书不受信任）\n'
    choice=$(choose "请选择" 2 "$([[ "$CA_ENV" == "staging" ]] && echo 2 || echo 1)")
    if [[ "$choice" == "2" ]]; then
        CA_ENV="staging"
        CA_SERVER="https://acme-staging-v02.api.letsencrypt.org/directory"
    else
        CA_ENV="production"
        CA_SERVER="letsencrypt"
    fi

    while true; do
        EMAIL=$(prompt_value "Let's Encrypt 账户邮箱" "${EMAIL:-admin@$BASE_DOMAIN}")
        is_valid_email "$EMAIL" && break
        error "邮箱格式不正确。"
    done

    printf '\n密钥类型：\n  1) RSA 2048（与网页版本一致，兼容性最好）\n  2) ECDSA P-256（更小更快）\n'
    choice=$(choose "请选择" 2 "$([[ "$KEY_LENGTH" == "ec-256" ]] && echo 2 || echo 1)")
    [[ "$choice" == "2" ]] && KEY_LENGTH="ec-256" || KEY_LENGTH="2048"
}

configure_dns_credentials() {
    local secret=""
    local account_id=""

    case "$DNS_PLUGIN" in
        dns_cf)
            if [[ -z "${CF_Token:-}" ]]; then
                read -r -s -p "Cloudflare API Token（输入不回显，留空则使用 acme.sh 已保存配置）: " secret || true
                printf '\n'
                [[ -n "$secret" ]] && export CF_Token=$secret
            fi
            if [[ -n "${CF_Token:-}" && -z "${CF_Account_ID:-}" ]]; then
                read -r -p "Cloudflare Account ID（通常可留空）: " account_id || true
                [[ -n "$account_id" ]] && export CF_Account_ID=$account_id
            fi
            ;;
        dns_ali)
            if [[ -z "${Ali_Key:-}" ]]; then
                read -r -p "阿里云 AccessKey ID（留空则使用 acme.sh 已保存配置）: " secret || true
                [[ -n "$secret" ]] && export Ali_Key=$secret
            fi
            if [[ -n "${Ali_Key:-}" && -z "${Ali_Secret:-}" ]]; then
                read -r -s -p "阿里云 AccessKey Secret（输入不回显）: " secret || true
                printf '\n'
                [[ -n "$secret" ]] && export Ali_Secret=$secret
            fi
            ;;
        dns_dp)
            if [[ -z "${DP_Id:-}" ]]; then
                read -r -p "DNSPod API ID（留空则使用 acme.sh 已保存配置）: " secret || true
                [[ -n "$secret" ]] && export DP_Id=$secret
            fi
            if [[ -n "${DP_Id:-}" && -z "${DP_Key:-}" ]]; then
                read -r -s -p "DNSPod API Key（输入不回显）: " secret || true
                printf '\n'
                [[ -n "$secret" ]] && export DP_Key=$secret
            fi
            ;;
        *)
            warn "请确认该插件需要的环境变量已经 export；密钥不会写入本助手配置。"
            info "插件文档：https://github.com/acmesh-official/acme.sh/wiki/dnsapi"
            ;;
    esac
}

configure_validation() {
    local choice=""
    local default_choice="1"
    local previous_method=$VALIDATION_METHOD

    if [[ "$CERT_SCOPE" == "wildcard" ]]; then
        warn "泛域名证书只能使用 DNS-01 验证。"
        printf '\nDNS 验证：\n  1) DNS API 自动验证（推荐，可自动续期）\n  2) 手工添加 TXT（无法无人值守续期）\n'
        choice=$(choose "请选择" 2 "$([[ "$previous_method" == "dns_manual" ]] && echo 2 || echo 1)")
        [[ "$choice" == "2" ]] && VALIDATION_METHOD="dns_manual" || VALIDATION_METHOD="dns_api"
    else
        [[ "$previous_method" == "webroot" ]] && default_choice="2"
        [[ "$previous_method" == "dns_api" ]] && default_choice="3"
        [[ "$previous_method" == "dns_manual" ]] && default_choice="4"
        printf '\n验证方式：\n  1) Nginx 自动验证（推荐，与证书更换一次完成）\n  2) HTTP-01 Webroot（已有固定验证 location）\n  3) DNS API 自动验证\n  4) 手工 DNS TXT\n'
        choice=$(choose "请选择" 4 "$default_choice")
        case "$choice" in
            2) VALIDATION_METHOD="webroot" ;;
            3) VALIDATION_METHOD="dns_api" ;;
            4) VALIDATION_METHOD="dns_manual" ;;
            *) VALIDATION_METHOD="nginx" ;;
        esac
    fi

    if [[ "$VALIDATION_METHOD" == "nginx" ]]; then
        command -v nginx >/dev/null 2>&1 || die "未找到 nginx，不能使用 Nginx 自动验证。"
        info "acme.sh 将临时添加 HTTP-01 验证配置，验证完成后自动恢复原配置。"
    elif [[ "$VALIDATION_METHOD" == "webroot" ]]; then
        while true; do
            WEBROOT=$(prompt_value "站点 Webroot" "${WEBROOT:-/var/www/html}")
            is_safe_absolute_path "$WEBROOT" && break
            error "Webroot 必须是安全的绝对路径，且不能是 /。"
        done
    elif [[ "$VALIDATION_METHOD" == "dns_api" ]]; then
        printf '\n常用插件：dns_ali（阿里云）、dns_dp（DNSPod）、dns_cf（Cloudflare）\n'
        while true; do
            DNS_PLUGIN=$(prompt_value "acme.sh DNS 插件名" "${DNS_PLUGIN:-dns_ali}")
            [[ "$DNS_PLUGIN" =~ ^dns_[A-Za-z0-9_]+$ ]] && break
            error "插件名格式不正确，应类似 dns_ali。"
        done
        configure_dns_credentials
    else
        warn "手工 DNS 每次续期都会产生新的 TXT 值，无法完全自动化。"
    fi
}

configure_installation() {
    local default_dir="/etc/nginx/ssl/$BASE_DOMAIN"
    local install_dir=""
    local use_detected="0"

    if [[ "$CA_ENV" == "staging" ]]; then
        INSTALL_TO_NGINX="0"
        warn "Staging 证书不受浏览器信任，本助手不会把它覆盖到生产 Nginx。"
        return
    fi

    confirm "签发后安装/更换 Nginx 证书？" yes && INSTALL_TO_NGINX="1" || INSTALL_TO_NGINX="0"
    [[ "$INSTALL_TO_NGINX" == "1" ]] || return

    if [[ "$NGINX_DETECTED" == "1" && -n "$CERT_FILE" && -n "$KEY_FILE" ]]; then
        printf '\n检测到当前 Nginx 正在引用：\n  证书：%s\n  私钥：%s\n' "$CERT_FILE" "$KEY_FILE"
        if confirm "直接安全更换这两个文件？" yes; then
            use_detected="1"
        else
            warn "为避免证书已生成但 Nginx 仍引用旧路径，本次只签发、不自动替换。"
            INSTALL_TO_NGINX="0"
            return
        fi
    fi

    if [[ "$use_detected" != "1" ]]; then
        CERT_FILE=""
        KEY_FILE=""
        install_dir=$(prompt_value "证书安装目录" "$default_dir")
        is_safe_absolute_path "$install_dir" || die "证书目录必须是安全的绝对路径。"
        CERT_FILE=$(prompt_value "fullchain 证书路径" "$install_dir/fullchain.pem")
        KEY_FILE=$(prompt_value "私钥路径" "$install_dir/privkey.pem")
        if [[ "$NGINX_DETECTED" == "1" ]]; then
            warn "你选择了新路径，请同时确认 Nginx 的 ssl_certificate 指令已经指向它。"
        fi
    fi

    is_safe_absolute_path "$CERT_FILE" || die "证书路径不安全。"
    is_safe_absolute_path "$KEY_FILE" || die "私钥路径不安全。"
    [[ "$CERT_FILE" != "$KEY_FILE" ]] || die "证书和私钥不能使用同一个路径。"

    if [[ -L "$CERT_FILE" || -L "$KEY_FILE" || "$CERT_FILE" == /etc/letsencrypt/* || "$KEY_FILE" == /etc/letsencrypt/* ]]; then
        warn "检测到 Certbot/符号链接管理路径，直接写入可能与原续期程序冲突。"
        confirm "确认改由本助手和 acme.sh 管理这些文件？" no \
            || die "已取消。建议为 acme.sh 使用独立证书路径并修改 Nginx 配置。"
    fi

    while true; do
        RENEW_DAYS=$(prompt_value "剩余多少天时允许更换" "${RENEW_DAYS:-30}")
        [[ "$RENEW_DAYS" =~ ^[0-9]+$ ]] && (( RENEW_DAYS >= 1 && RENEW_DAYS <= 89 )) && break
        error "请输入 1-89。"
    done
}

validation_label() {
    case "$VALIDATION_METHOD" in
        nginx) printf 'HTTP-01 / Nginx 自动配置并恢复' ;;
        webroot) printf 'HTTP-01 / Webroot (%s)' "$WEBROOT" ;;
        dns_api) printf 'DNS-01 / %s' "$DNS_PLUGIN" ;;
        dns_manual) printf 'DNS-01 / 手工 TXT' ;;
    esac
}

show_plan() {
    local domain_text=""
    domain_text=$(IFS=', '; printf '%s' "${DOMAINS[*]}")
    rule
    printf '%s执行计划%s\n' "$C_BOLD" "$C_RESET"
    printf '域名：      %s\n' "$domain_text"
    printf 'CA：        Let\x27s Encrypt %s\n' "$([[ "$CA_ENV" == "production" ]] && echo 生产环境 || echo Staging)"
    printf '验证：      %s\n' "$(validation_label)"
    printf '密钥：      %s\n' "$KEY_LENGTH"
    if [[ "$NGINX_DETECTED" == "1" ]]; then
        printf 'Nginx 配置：%s\n' "${NGINX_CONFIG_FILE:-已自动识别}"
        printf 'server_name：%s\n' "${NGINX_SERVER_NAMES:-$BASE_DOMAIN}"
    fi
    if [[ "$INSTALL_TO_NGINX" == "1" ]]; then
        printf '证书文件：  %s\n' "$CERT_FILE"
        printf '私钥文件：  %s\n' "$KEY_FILE"
        if [[ -n "$NGINX_CERT_FILE" && "$CERT_FILE" == "$NGINX_CERT_FILE" && "$KEY_FILE" == "$NGINX_KEY_FILE" ]]; then
            printf 'Nginx 引用：已确认使用上述路径\n'
        else
            printf '%sNginx 引用：尚未确认使用上述路径%s\n' "$C_YELLOW" "$C_RESET"
            printf '需要配置：  ssl_certificate %s;\n' "$CERT_FILE"
            printf '             ssl_certificate_key %s;\n' "$KEY_FILE"
        fi
        printf '更换阈值：  剩余 %s 天\n' "$RENEW_DAYS"
        printf '上线动作：  备份 → 安装 → 校验 → nginx -t → reload\n'
    else
        printf '自动安装：  否\n'
    fi
    rule
}

prepare_http_webroot() {
    local challenge_dir="$WEBROOT/.well-known/acme-challenge"
    local test_name="dns-ssl-preflight-$$"
    local test_value="dns-ssl-ok-$(date +%s)"
    local response=""
    local test_file="$challenge_dir/$test_name"

    mkdir -p -- "$challenge_dir"
    chmod 755 "$WEBROOT/.well-known" "$challenge_dir" 2>/dev/null || true
    printf '%s' "$test_value" >"$test_file"
    chmod 644 "$test_file"

    info "检查公网 HTTP 验证路径..."
    if command -v curl >/dev/null 2>&1; then
        response=$(curl --fail --silent --show-error --max-time 12 \
            "http://$BASE_DOMAIN/.well-known/acme-challenge/$test_name" 2>/dev/null || true)
    elif command -v wget >/dev/null 2>&1; then
        response=$(wget --quiet --timeout=12 --output-document=- \
            "http://$BASE_DOMAIN/.well-known/acme-challenge/$test_name" 2>/dev/null || true)
    else
        warn "没有 curl/wget，跳过 HTTP 预检。"
        rm -f -- "$test_file"
        return 0
    fi
    rm -f -- "$test_file"

    if [[ "$response" == "$test_value" ]]; then
        success "HTTP-01 路径可访问，写入挑战文件不需要 reload Nginx。"
        return 0
    fi

    error "公网没有读到刚写入的验证内容。"
    printf '\n请确认 Nginx 中存在：\n'
    printf 'location ^~ /.well-known/acme-challenge/ {\n'
    printf '    root %s;\n' "$WEBROOT"
    printf '}\n\n'
    warn "只有新增/修改上述 location 后才必须执行：nginx -t && nginx -s reload"
    warn "以后仅更新挑战文件时不需要 reload。"
    confirm "我已确认配置，仍继续让 CA 验证？" no
}

prepare_nginx_validation() {
    if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
        error "Nginx 自动验证需要 root 权限，请使用 sudo bash $0。"
        return 1
    fi
    command -v nginx >/dev/null 2>&1 || return 1
    info "先检查现有 Nginx 配置..."
    if ! nginx -t; then
        error "现有 Nginx 配置未通过，停止验证和证书更换。"
        return 1
    fi
    success "Nginx 配置正常。接下来自动完成临时验证配置、CA 验证、恢复配置和证书更换。"
}

register_account() {
    refresh_acme_config_home
    info "准备 Let's Encrypt 账户..."
    "$ACME_BIN" --register-account --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME" \
        --server "$CA_SERVER" -m "$EMAIL" >/dev/null
}

run_issue_command() {
    local -a args=()
    local domain=""
    local issue_ok="0"

    refresh_acme_config_home
    args=(--issue --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME" \
        --server "$CA_SERVER" --keylength "$KEY_LENGTH")
    for domain in "${DOMAINS[@]}"; do
        args+=(-d "$domain")
    done

    case "$VALIDATION_METHOD" in
        nginx)
            if [[ -n "$NGINX_CONFIG_FILE" && -f "$NGINX_CONFIG_FILE" ]]; then
                args+=(--nginx "$NGINX_CONFIG_FILE")
            else
                args+=(--nginx)
            fi
            ;;
        webroot) args+=(--webroot "$WEBROOT") ;;
        dns_api) args+=(--dns "$DNS_PLUGIN") ;;
        dns_manual) args+=(--dns --yes-I-know-dns-manual-mode-enough-go-ahead-please) ;;
    esac
    [[ "$FORCE_ISSUE" == "1" ]] && args+=(--force)

    info "执行证书申请/续期："
    print_command "$ACME_BIN" "${args[@]}"
    if "$ACME_BIN" "${args[@]}"; then
        issue_ok="1"
    fi

    if [[ "$VALIDATION_METHOD" != "dns_manual" ]]; then
        [[ "$issue_ok" == "1" ]]
        return
    fi

    if [[ "$issue_ok" == "1" ]]; then
        return 0
    fi

    printf '\n'
    warn "上方已经给出本次 TXT 记录名和值。根域名和泛域名可能需要同时保留两个 TXT 值。"
    read -r -p "添加 TXT 并确认公共 DNS 已生效后，按 Enter 继续验证；输入 q 取消: " domain || true
    [[ "${domain,,}" != "q" ]] || return 1

    args=(--renew --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME" \
        --server "$CA_SERVER" -d "$PRIMARY_IDENTIFIER" \
        --yes-I-know-dns-manual-mode-enough-go-ahead-please)
    [[ "$KEY_LENGTH" == ec-* ]] && args+=(--ecc)
    [[ "$FORCE_ISSUE" == "1" ]] && args+=(--force)
    print_command "$ACME_BIN" "${args[@]}"
    "$ACME_BIN" "${args[@]}"
}

nginx_reload_command() {
    local nginx_bin systemctl_bin service_bin
    nginx_bin=$(command -v nginx)
    if command -v systemctl >/dev/null 2>&1; then
        systemctl_bin=$(command -v systemctl)
        printf '%s -t && (%s reload nginx || %s -s reload)' \
            "$nginx_bin" "$systemctl_bin" "$nginx_bin"
    elif command -v service >/dev/null 2>&1; then
        service_bin=$(command -v service)
        printf '%s -t && (%s nginx reload || %s -s reload)' \
            "$nginx_bin" "$service_bin" "$nginx_bin"
    else
        printf '%s -t && %s -s reload' "$nginx_bin" "$nginx_bin"
    fi
}

restore_backup() {
    local backup_dir=$1
    local restored="0"

    if [[ -f "$backup_dir/fullchain.pem" ]]; then
        cp -p -- "$backup_dir/fullchain.pem" "$CERT_FILE"
        restored="1"
    fi
    if [[ -f "$backup_dir/privkey.pem" ]]; then
        cp -p -- "$backup_dir/privkey.pem" "$KEY_FILE"
        restored="1"
    fi
    if [[ "$restored" == "1" ]]; then
        warn "已从备份恢复上一版证书文件。"
        if command -v nginx >/dev/null 2>&1 && nginx -t; then
            if command -v systemctl >/dev/null 2>&1; then
                systemctl reload nginx || nginx -s reload || true
            else
                nginx -s reload || true
            fi
        fi
    fi
}

install_nginx_certificate() {
    local timestamp backup_dir reload_cmd
    local preview_dir preview_cert preview_key
    local -a args=() preview_args=()

    require_root_for_install
    command -v nginx >/dev/null 2>&1 || die "未找到 nginx，无法执行安装和安全重载。"
    ensure_openssl
    refresh_acme_config_home

    if [[ -n "$NGINX_CERT_FILE" ]] \
        && { [[ "$CERT_FILE" != "$NGINX_CERT_FILE" ]] || [[ "$KEY_FILE" != "$NGINX_KEY_FILE" ]]; }; then
        error "目标文件与活动 Nginx 配置引用的路径不一致，拒绝执行无效更换。"
        return 1
    fi

    preview_dir=$(mktemp -d "${TMPDIR:-/tmp}/dns-ssl-preview.XXXXXX")
    preview_cert="$preview_dir/fullchain.pem"
    preview_key="$preview_dir/privkey.pem"
    preview_args=(--install-cert --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME" \
        -d "$PRIMARY_IDENTIFIER" \
        --key-file "$preview_key" --fullchain-file "$preview_cert" --reloadcmd ":")
    [[ "$KEY_LENGTH" == ec-* ]] && preview_args+=(--ecc)

    info "在触碰 Nginx 文件前校验本次签发结果..."
    if ! "$ACME_BIN" "${preview_args[@]}" >/dev/null; then
        rm -rf -- "$preview_dir"
        error "无法读取本次签发的证书，未修改 Nginx。"
        return 1
    fi
    if ! certificate_matches_key "$preview_cert" "$preview_key"; then
        rm -rf -- "$preview_dir"
        error "本次证书与私钥不匹配，未修改 Nginx。"
        return 1
    fi
    if [[ "$CERT_SCOPE" == "wildcard" ]]; then
        if ! certificate_covers_domain "$preview_cert" "probe.$BASE_DOMAIN"; then
            rm -rf -- "$preview_dir"
            error "本次证书不覆盖 *.$BASE_DOMAIN，未修改 Nginx。"
            return 1
        fi
    elif ! certificate_covers_domain "$preview_cert" "$BASE_DOMAIN"; then
        rm -rf -- "$preview_dir"
        error "本次证书不覆盖 $BASE_DOMAIN，未修改 Nginx。"
        return 1
    fi
    rm -rf -- "$preview_dir"
    success "签发结果、私钥和域名覆盖范围均有效。"

    timestamp=$(date +%Y%m%d-%H%M%S)
    backup_dir="$BACKUP_ROOT/$BASE_DOMAIN/$timestamp"
    mkdir -p -- "$(dirname "$CERT_FILE")" "$(dirname "$KEY_FILE")" "$backup_dir"
    chmod 700 "$backup_dir"

    if [[ -s "$CERT_FILE" ]]; then
        cp -p -- "$CERT_FILE" "$backup_dir/fullchain.pem"
    fi
    if [[ -s "$KEY_FILE" ]]; then
        cp -p -- "$KEY_FILE" "$backup_dir/privkey.pem"
    fi
    if [[ -f "$backup_dir/fullchain.pem" || -f "$backup_dir/privkey.pem" ]]; then
        success "旧证书已备份：$backup_dir"
    fi

    touch "$CERT_FILE" "$KEY_FILE"
    chmod 644 "$CERT_FILE"
    chmod 600 "$KEY_FILE"
    reload_cmd=$(nginx_reload_command)
    args=(--install-cert --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME" \
        -d "$PRIMARY_IDENTIFIER" \
        --key-file "$KEY_FILE" --fullchain-file "$CERT_FILE" --reloadcmd "$reload_cmd")
    [[ "$KEY_LENGTH" == ec-* ]] && args+=(--ecc)

    info "安装证书并执行安全重载："
    print_command "$ACME_BIN" "${args[@]}"
    if ! "$ACME_BIN" "${args[@]}"; then
        error "安装或 Nginx 重载失败。运行中的 Nginx 不会加载未通过检查的配置。"
        restore_backup "$backup_dir"
        return 1
    fi

    if ! certificate_matches_key "$CERT_FILE" "$KEY_FILE"; then
        error "新证书与私钥不匹配，立即回滚。"
        restore_backup "$backup_dir"
        return 1
    fi

    if [[ "$CERT_SCOPE" == "wildcard" ]]; then
        if ! certificate_covers_domain "$CERT_FILE" "probe.$BASE_DOMAIN"; then
            error "新证书不覆盖 *.$BASE_DOMAIN，立即回滚。"
            restore_backup "$backup_dir"
            return 1
        fi
    elif ! certificate_covers_domain "$CERT_FILE" "$BASE_DOMAIN"; then
        error "新证书不覆盖 $BASE_DOMAIN，立即回滚。"
        restore_backup "$backup_dir"
        return 1
    fi

    if ! nginx -t >/dev/null; then
        error "Nginx 最终检查失败，立即回滚。"
        restore_backup "$backup_dir"
        return 1
    fi
    success "证书、私钥、域名覆盖和 Nginx 配置均已通过检查。"
    show_certificate_file "$CERT_FILE" "已安装证书" || true
}

profile_path() {
    printf '%s/%s.conf' "$PROFILE_DIR" "$BASE_DOMAIN"
}

save_profile() {
    local path temp
    [[ ${EUID:-$(id -u)} -eq 0 ]] || return 0
    mkdir -p -- "$PROFILE_DIR"
    chmod 700 "$PROFILE_DIR"
    path=$(profile_path)
    temp="$path.tmp.$$"
    umask 077
    {
        printf 'BASE_DOMAIN=%s\n' "$BASE_DOMAIN"
        printf 'CERT_SCOPE=%s\n' "$CERT_SCOPE"
        printf 'INCLUDE_APEX=%s\n' "$INCLUDE_APEX"
        printf 'EMAIL=%s\n' "$EMAIL"
        printf 'CA_ENV=%s\n' "$CA_ENV"
        printf 'KEY_LENGTH=%s\n' "$KEY_LENGTH"
        printf 'VALIDATION_METHOD=%s\n' "$VALIDATION_METHOD"
        printf 'WEBROOT=%s\n' "$WEBROOT"
        printf 'DNS_PLUGIN=%s\n' "$DNS_PLUGIN"
        printf 'INSTALL_TO_NGINX=%s\n' "$INSTALL_TO_NGINX"
        printf 'CERT_FILE=%s\n' "$CERT_FILE"
        printf 'KEY_FILE=%s\n' "$KEY_FILE"
        printf 'RENEW_DAYS=%s\n' "$RENEW_DAYS"
    } >"$temp"
    mv -f -- "$temp" "$path"
    chmod 600 "$path"
    success "配置已保存：$path（不包含 DNS API 密钥）"
}

load_profile_file() {
    local path=$1
    local key value

    while IFS='=' read -r key value; do
        case "$key" in
            BASE_DOMAIN) BASE_DOMAIN=$value ;;
            CERT_SCOPE) CERT_SCOPE=$value ;;
            INCLUDE_APEX) INCLUDE_APEX=$value ;;
            EMAIL) EMAIL=$value ;;
            CA_ENV) CA_ENV=$value ;;
            KEY_LENGTH) KEY_LENGTH=$value ;;
            VALIDATION_METHOD) VALIDATION_METHOD=$value ;;
            WEBROOT) WEBROOT=$value ;;
            DNS_PLUGIN) DNS_PLUGIN=$value ;;
            INSTALL_TO_NGINX) INSTALL_TO_NGINX=$value ;;
            CERT_FILE) CERT_FILE=$value ;;
            KEY_FILE) KEY_FILE=$value ;;
            RENEW_DAYS) RENEW_DAYS=$value ;;
        esac
    done <"$path"

    is_valid_domain "$BASE_DOMAIN" || die "配置文件中的域名无效：$path"
    [[ "$CA_ENV" == "staging" ]] \
        && CA_SERVER="https://acme-staging-v02.api.letsencrypt.org/directory" \
        || CA_SERVER="letsencrypt"
    build_domain_list
}

choose_profile() {
    local -a files=()
    local file choice index=1

    [[ -d "$PROFILE_DIR" ]] || return 1
    while IFS= read -r -d '' file; do
        files+=("$file")
    done < <(find "$PROFILE_DIR" -maxdepth 1 -type f -name '*.conf' -print0 2>/dev/null | sort -z)
    (( ${#files[@]} > 0 )) || return 1

    printf '已保存的服务器配置：\n'
    for file in "${files[@]}"; do
        printf '  %d) %s\n' "$index" "$(basename "$file" .conf)"
        ((index++))
    done
    printf '  0) 新建配置\n'
    choice=$(choose "请选择" "${#files[@]}" 1)
    [[ "$choice" != "0" ]] || return 1
    load_profile_file "${files[choice-1]}"
    success "已载入 $BASE_DOMAIN 的配置。"
    return 0
}

should_skip_fresh_certificate() {
    local days=""
    [[ "$INSTALL_TO_NGINX" == "1" && "$FORCE_ISSUE" == "0" ]] || return 1
    certificate_is_fresh "$CERT_FILE" || return 1
    if [[ "$CERT_SCOPE" == "wildcard" ]]; then
        certificate_covers_domain "$CERT_FILE" "probe.$BASE_DOMAIN" || return 1
    else
        certificate_covers_domain "$CERT_FILE" "$BASE_DOMAIN" || return 1
    fi
    show_certificate_file "$CERT_FILE" "当前 Nginx 证书" || true
    days=$(certificate_days_left "$CERT_FILE" || true)
    success "证书仍有 ${days:-超过 $RENEW_DAYS} 天有效期。继续使用不会创建 ACME 订单，也不会 reload Nginx。"
    if confirm "跳过本次签发/更换？" yes; then
        return 0
    fi
    warn "有效证书通常不应重复签发；强制签发会消耗 CA 速率额度。"
    if confirm "确定强制重新签发？" no; then
        FORCE_ISSUE="1"
        return 1
    fi
    return 0
}

issue_workflow() {
    local loaded="0"

    header
    choose_profile && loaded="1" || true
    printf '\n'
    configure_domain
    if detect_nginx_context "$BASE_DOMAIN"; then
        success "已从 nginx -T 自动识别当前站点配置和证书位置。"
        show_nginx_context || true
    else
        warn "未自动识别到站点配置，后续可手工确认 Webroot 和证书路径。"
    fi

    ensure_openssl
    if should_skip_fresh_certificate; then
        save_profile
        pause_screen
        return
    fi

    configure_ca
    configure_validation
    configure_installation
    build_domain_list
    show_plan

    confirm "确认执行？" yes || { warn "已取消。"; pause_screen; return; }
    require_root_for_install
    ensure_openssl

    if [[ "$INSTALL_TO_NGINX" == "1" && -s "$CERT_FILE" && "$FORCE_ISSUE" == "0" ]]; then
        if confirm "当前证书已进入续期窗口；正常续期失败时不覆盖旧证书。是否继续？" yes; then
            :
        else
            pause_screen
            return
        fi
    elif [[ "$loaded" == "1" && "$FORCE_ISSUE" == "1" ]]; then
        warn "已选择强制签发，会消耗 CA 速率额度。"
    fi

    case "$VALIDATION_METHOD" in
        nginx)
            prepare_nginx_validation || { warn "已取消申请。"; pause_screen; return; }
            ;;
        webroot)
            prepare_http_webroot || { warn "已取消申请。"; pause_screen; return; }
            ;;
    esac

    if ! ensure_acme_sh; then
        warn "没有 ACME 客户端，已取消申请。"
        pause_screen
        return
    fi
    if ! register_account; then
        error "Let's Encrypt 账户准备失败，未修改 Nginx。"
        pause_screen
        return
    fi
    if ! run_issue_command; then
        error "证书签发失败，未修改 Nginx 证书。"
        pause_screen
        return
    fi
    success "证书签发/续期完成。"

    if [[ "$CA_ENV" == "staging" ]]; then
        warn "这是不受信任的 Staging 证书，未安装到生产 Nginx。"
        "$ACME_BIN" --info --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME" \
            -d "$PRIMARY_IDENTIFIER" || true
    elif [[ "$INSTALL_TO_NGINX" == "1" ]]; then
        install_nginx_certificate || { pause_screen; return; }
    else
        info "证书由 acme.sh 管理。需要部署时请重新运行并选择安装到 Nginx。"
        "$ACME_BIN" --info --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME" \
            -d "$PRIMARY_IDENTIFIER" || true
    fi

    save_profile
    success "全部完成。后续 acme.sh cron 仅在实际续期成功后执行 Nginx reload。"
    pause_screen
}

run_acme_cron() {
    header
    if ! ensure_acme_sh; then
        warn "没有 ACME 客户端。"
        pause_screen
        return
    fi
    CA_ENV="production"
    refresh_acme_config_home
    info "检查所有 acme.sh 托管证书；未到续期时间的证书会自动跳过。"
    print_command "$ACME_BIN" --cron --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME"
    "$ACME_BIN" --cron --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME"
    success "续期检查完成。"
    pause_screen
}

list_acme_certificates() {
    header
    if ! ensure_acme_sh; then
        warn "没有 ACME 客户端。"
        pause_screen
        return
    fi
    CA_ENV="production"
    refresh_acme_config_home
    "$ACME_BIN" --list --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME" || true
    pause_screen
}

main_menu() {
    local choice=""
    while true; do
        header
        printf '  1) 一键申请 / 续期 / 更换 Nginx 证书\n'
        printf '  2) 证书有效期查询（线上 + Nginx 本机，只读）\n'
        printf '  3) 查看 Nginx 配置和证书位置（只读）\n'
        printf '  4) 检查指定本机证书文件\n'
        printf '  5) 运行到期续期检查（未到期自动跳过）\n'
        printf '  6) 查看 acme.sh 托管证书\n'
        printf '  0) 退出\n\n'
        choice=$(choose "请选择操作" 6 1)
        case "$choice" in
            1) issue_workflow ;;
            2) query_certificate_status "" yes || true ;;
            3) inspect_nginx_configuration ;;
            4) inspect_local_certificate ;;
            5) run_acme_cron ;;
            6) list_acme_certificates ;;
            0) printf '再见。\n'; return ;;
        esac
    done
}

usage() {
    cat <<EOF
$PROGRAM_NAME v$VERSION

用法：
  sudo bash dns-ssl.sh              打开命令行 UI
  bash dns-ssl.sh --check <域名>    只读查询线上和 Nginx 本机证书有效期
  sudo bash dns-ssl.sh --cron       立即检查所有托管证书是否需要续期
  bash dns-ssl.sh --help            显示帮助

环境变量：
  DNS_SSL_ACME_SH       指定 acme.sh 可执行文件
  DNS_SSL_ACME_HOME     指定 acme.sh 数据目录
  DNS_SSL_ACME_CONFIG_HOME  指定 acme.sh 配置/证书目录
  DNS_SSL_PROFILE_DIR   指定本助手配置目录
  DNS_SSL_BACKUP_DIR    指定旧证书备份目录
  NO_COLOR=1            关闭彩色输出

说明：
  - 默认仅在证书剩余 30 天以内时更换，避免重复签发和重复 reload。
  - 输入域名后自动读取 nginx -T，识别配置文件、站点 root 和证书路径。
  - 单域名默认使用 Nginx 自动验证，完成验证后立即安全更换证书。
  - 泛域名必须使用 DNS-01；DNS API 模式支持无人值守续期。
  - Nginx 仅在证书实际安装/续期后执行 nginx -t 和优雅 reload。
EOF
}

main() {
    case "${1:-}" in
        --help|-h) usage ;;
        --version|-v) printf '%s\n' "$VERSION" ;;
        --check)
            [[ -n "${2:-}" ]] || die "--check 后必须提供域名。"
            query_certificate_status "$2" no
            ;;
        --cron)
            ensure_acme_sh
            CA_ENV="production"
            refresh_acme_config_home
            "$ACME_BIN" --cron --home "$ACME_HOME" --config-home "$ACME_CONFIG_HOME"
            ;;
        "") main_menu ;;
        *) usage; exit 2 ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
