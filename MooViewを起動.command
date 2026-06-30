#!/bin/zsh

# Finderから起動した場合でも、Homebrew版Node.jsを検出できるようにします。
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

readonly REPO_ROOT="${0:A:h}"
readonly REQUIREMENTS_PATH="${REPO_ROOT}/requirements-moomoo.txt"
readonly PACKAGE_JSON_PATH="${REPO_ROOT}/package.json"
readonly PACKAGE_LOCK_PATH="${REPO_ROOT}/package-lock.json"
readonly PYTHON_RUNTIME_ROOT="${HOME}/.local/share/mooview"
readonly PYTHON_VENV_PATH="${PYTHON_RUNTIME_ROOT}/venv"
readonly PYTHON_PATH="${PYTHON_VENV_PATH}/bin/python"
readonly MAC_RUNTIME_ROOT="${HOME}/Library/Application Support/MooView"
readonly NODE_RUNTIME_ROOT="${MAC_RUNTIME_ROOT}/node-runtime"
readonly MAC_APP_ROOT="${NODE_RUNTIME_ROOT}/app"
readonly NODE_TSX_PATH="${NODE_RUNTIME_ROOT}/node_modules/.bin/tsx"
readonly SERVER_LAUNCHER_PATH="${NODE_RUNTIME_ROOT}/start-server.command"
readonly LOG_ROOT="${HOME}/Library/Logs/MooView"
readonly LAUNCH_SERVICE_LABEL="com.mooview.server"
readonly APP_BASE_URL="http://127.0.0.1:3000"

typeset -g PYTHON_BOOTSTRAP=""

function print_step() {
    print ""
    print -P "%F{cyan}【MooView】${1}%f"
}

function print_success() {
    print -P "%F{green}${1}%f"
}

function print_warning() {
    print -P "%F{yellow}${1}%f"
}

function fail() {
    print ""
    print -P "%F{red}MooViewの起動に失敗しました。%f"
    print -P "%F{red}${1}%f"
    if [[ -t 0 ]]; then
        print ""
        read -r "?Enterキーを押すと終了します。"
    fi
    exit 1
}

function require_command() {
    local command_name="${1}"
    local guidance="${2}"

    if ! command -v "${command_name}" >/dev/null 2>&1; then
        fail "${guidance}"
    fi
}

function select_compatible_python() {
    local candidate
    local detected_python
    detected_python="$(command -v python3 2>/dev/null)" || true

    for candidate in \
        "/usr/bin/python3" \
        "/opt/homebrew/bin/python3.11" \
        "/opt/homebrew/bin/python3.10" \
        "/opt/homebrew/bin/python3.9" \
        "/opt/homebrew/bin/python3.8" \
        "/usr/local/bin/python3.11" \
        "/usr/local/bin/python3.10" \
        "/usr/local/bin/python3.9" \
        "/usr/local/bin/python3.8" \
        "${detected_python}"; do
        [[ -n "${candidate}" && -x "${candidate}" ]] || continue
        if "${candidate}" -c \
            "import sys; raise SystemExit(0 if (3, 8) <= sys.version_info[:2] <= (3, 11) else 1)" \
            >/dev/null 2>&1; then
            PYTHON_BOOTSTRAP="${candidate}"
            return 0
        fi
    done

    fail "対応するPythonが見つかりません。Python 3.8〜3.11（推奨: Python 3.11）をインストールしてください。"
}

function tcp_port_is_open() {
    /usr/bin/nc -z 127.0.0.1 "${1}" >/dev/null 2>&1
}

function web_is_ready() {
    /usr/bin/curl \
        --silent \
        --show-error \
        --fail \
        --max-time 3 \
        "${APP_BASE_URL}" \
        >/dev/null 2>&1
}

function wait_for_web() {
    local attempt
    for attempt in {1..180}; do
        if web_is_ready; then
            return 0
        fi
        if (( attempt > 10 )) &&
            ! /bin/launchctl print \
                "gui/$(/usr/bin/id -u)/${LAUNCH_SERVICE_LABEL}" \
                2>/dev/null |
                /usr/bin/grep -q "pid ="; then
            return 2
        fi
        /bin/sleep 0.5
    done
    return 1
}

function find_opend_app() {
    local app_name
    for app_name in "OpenD" "FutuOpenD" "Moomoo OpenD" "moomoo OpenD"; do
        if /usr/bin/open -Ra "${app_name}" >/dev/null 2>&1; then
            print -r -- "${app_name}"
            return 0
        fi
    done
    return 1
}

function start_opend_if_available() {
    if tcp_port_is_open 11111; then
        print_success "OpenD接続: 正常（127.0.0.1:11111）"
        return 0
    fi

    local opend_app
    opend_app="$(find_opend_app)" || true
    if [[ -z "${opend_app}" ]]; then
        print_warning "OpenD注意: Mac版OpenDが見つかりません。MooView本体は起動しますが、実データ接続は利用できません。"
        return 0
    fi

    print_step "Mac版OpenDを起動しています。"
    if ! /usr/bin/open -a "${opend_app}"; then
        print_warning "OpenD注意: ${opend_app} を起動できませんでした。MooView本体の起動は続けます。"
        return 0
    fi

    local attempt
    for attempt in {1..40}; do
        if tcp_port_is_open 11111; then
            print_success "OpenD接続: 正常（127.0.0.1:11111）"
            return 0
        fi
        /bin/sleep 0.5
    done

    print_warning "OpenD注意: 127.0.0.1:11111 を確認できません。OpenDでログイン後、MooViewを再度起動してください。"
}

function ensure_python_runtime() {
    if [[ -z "${PYTHON_BOOTSTRAP}" ]]; then
        select_compatible_python
    fi

    if [[ ! -x "${PYTHON_PATH}" ]]; then
        print_step "MooView専用Python環境を作成しています。"
        /bin/mkdir -p "${PYTHON_RUNTIME_ROOT}" ||
            fail "Python環境の保存先を作成できません: ${PYTHON_RUNTIME_ROOT}"
        "${PYTHON_BOOTSTRAP}" -m venv --system-site-packages "${PYTHON_VENV_PATH}" ||
            fail "Python仮想環境の作成に失敗しました: ${PYTHON_VENV_PATH}"
    fi

    if ! "${PYTHON_PATH}" -c "import moomoo, pandas, Crypto" >/dev/null 2>&1; then
        print_step "Moomoo公式Python SDKをインストールしています。"
        "${PYTHON_PATH}" -m pip install \
            --disable-pip-version-check \
            "numpy<2" \
            -r "${REQUIREMENTS_PATH}" ||
            fail "Python依存関係のインストールに失敗しました。"
    fi

    "${PYTHON_PATH}" -c "import moomoo, pandas, Crypto" >/dev/null 2>&1 ||
        fail "Python依存関係をインストールしましたが、Moomoo SDKを読み込めませんでした。"

    print_success "Python SDK: 正常（${PYTHON_PATH}）"
}

function install_local_node_modules() {
    /bin/mkdir -p "${NODE_RUNTIME_ROOT}" ||
        fail "Node.js環境の保存先を作成できません: ${NODE_RUNTIME_ROOT}"
    /bin/cp "${PACKAGE_JSON_PATH}" "${NODE_RUNTIME_ROOT}/package.json" ||
        fail "package.jsonをローカル環境へコピーできませんでした。"
    /bin/cp "${PACKAGE_LOCK_PATH}" "${NODE_RUNTIME_ROOT}/package-lock.json" ||
        fail "package-lock.jsonをローカル環境へコピーできませんでした。"

    npm install \
        --prefix "${NODE_RUNTIME_ROOT}" \
        --package-lock=false \
        --include=optional \
        --no-audit \
        --no-fund ||
        fail "Node.js依存関係のインストールに失敗しました。"
}

function local_node_runtime_needs_update() {
    [[ ! -x "${NODE_TSX_PATH}" ]] && return 0
    [[ ! -f "${NODE_RUNTIME_ROOT}/package.json" ]] && return 0
    [[ ! -f "${NODE_RUNTIME_ROOT}/package-lock.json" ]] && return 0
    ! /usr/bin/cmp -s "${PACKAGE_JSON_PATH}" "${NODE_RUNTIME_ROOT}/package.json" && return 0
    ! /usr/bin/cmp -s "${PACKAGE_LOCK_PATH}" "${NODE_RUNTIME_ROOT}/package-lock.json" && return 0
    return 1
}

function ensure_node_runtime() {
    require_command \
        "node" \
        "Node.jsが見つかりません。https://nodejs.org/ からLTS版をインストールしてください。"
    require_command \
        "npm" \
        "npmが見つかりません。Node.jsのLTS版を再インストールしてください。"

    if local_node_runtime_needs_update; then
        print_step "OneDrive外のMac専用領域へNode.js依存関係をインストールしています。"
        install_local_node_modules
    fi

    print_success "Node.js依存関係: 正常（${NODE_RUNTIME_ROOT}/node_modules）"
}

function sync_mac_runtime_source() {
    print_step "共通ソースをOneDrive外のMac実行領域へ同期しています。"
    /bin/mkdir -p "${MAC_APP_ROOT}" ||
        fail "Mac実行領域を作成できません: ${MAC_APP_ROOT}"

    /usr/bin/rsync \
        --archive \
        --delete \
        --delete-excluded \
        --exclude="/.git/" \
        --exclude="/node_modules/" \
        --exclude="/.env" \
        --exclude="/.env.*" \
        --exclude="/docs/" \
        --exclude="/dist/" \
        --exclude="/build/" \
        --exclude="/coverage/" \
        --exclude="/__pycache__/" \
        --exclude="/tmp_*" \
        "${REPO_ROOT}/" \
        "${MAC_APP_ROOT}/" ||
        fail "共通ソースをMac実行領域へ同期できませんでした。"

    print_success "Mac実行領域: 正常（${MAC_APP_ROOT}）"
}

function run_preflight_check() {
    print_step "起動前確認を実行します。"

    [[ -f "${PACKAGE_JSON_PATH}" ]] ||
        fail "package.jsonが見つかりません: ${PACKAGE_JSON_PATH}"
    [[ -f "${PACKAGE_LOCK_PATH}" ]] ||
        fail "package-lock.jsonが見つかりません: ${PACKAGE_LOCK_PATH}"
    [[ -f "${REQUIREMENTS_PATH}" ]] ||
        fail "Python依存関係ファイルが見つかりません: ${REQUIREMENTS_PATH}"

    require_command \
        "node" \
        "Node.jsが見つかりません。https://nodejs.org/ からLTS版をインストールしてください。"
    require_command \
        "npm" \
        "npmが見つかりません。Node.jsのLTS版を再インストールしてください。"
    [[ -x "/usr/bin/rsync" ]] ||
        fail "macOS標準のrsyncが見つかりません: /usr/bin/rsync"
    select_compatible_python

    print_success "プロジェクト: 正常（${REPO_ROOT}）"
    print_success "Node.js: 正常（$(command -v node)、$(node --version)）"
    print_success "npm: 正常（$(command -v npm)、$(npm --version)）"
    print_success "Python 3: 正常（${PYTHON_BOOTSTRAP}、$("${PYTHON_BOOTSTRAP}" --version 2>&1)）"

    print_success "重いファイルの保存先: OneDrive外（${MAC_RUNTIME_ROOT}）"
}

function run_server_process() {
    cd "${MAC_APP_ROOT}" || exit 1
    export MOOMOO_PYTHON="${PYTHON_PATH}"
    export MOOMOO_GATEWAY_URL="http://127.0.0.1:8787"
    export MOOMOO_GATEWAY_AUTOSTART="true"
    export NODE_OPTIONS="--use-system-ca"
    export DISABLE_HMR="true"
    exec "${NODE_TSX_PATH}" server.ts
}

function start_mooview_server() {
    if web_is_ready; then
        print_success "MooView Web: 既に起動しています（${APP_BASE_URL}）"
        return 0
    fi

    if tcp_port_is_open 3000; then
        fail "127.0.0.1:3000 は別のアプリが使用しています。そのアプリを終了してから、もう一度実行してください。"
    fi

    /bin/mkdir -p "${LOG_ROOT}" ||
        fail "ログ保存先を作成できません: ${LOG_ROOT}"

    local timestamp
    local stdout_log
    local stderr_log
    local wait_result
    timestamp="$(/bin/date +%Y%m%d-%H%M%S)"
    stdout_log="${LOG_ROOT}/mooview-${timestamp}.log"
    stderr_log="${LOG_ROOT}/mooview-${timestamp}.err.log"

    print_step "MooViewサーバーを起動しています。"
    if /bin/launchctl print \
        "gui/$(/usr/bin/id -u)/${LAUNCH_SERVICE_LABEL}" \
        >/dev/null 2>&1; then
        /bin/launchctl remove "${LAUNCH_SERVICE_LABEL}" ||
            fail "以前のMooView起動サービスを終了できませんでした。"
        /bin/sleep 0.5
    fi

    /bin/cp \
        "${REPO_ROOT}/MooViewを起動.command" \
        "${SERVER_LAUNCHER_PATH}" ||
        fail "Mac用サーバー起動ラッパーを作成できませんでした。"
    /bin/chmod +x "${SERVER_LAUNCHER_PATH}" ||
        fail "Mac用サーバー起動ラッパーに実行権限を設定できませんでした。"

    /bin/launchctl submit \
        -l "${LAUNCH_SERVICE_LABEL}" \
        -o "${stdout_log}" \
        -e "${stderr_log}" \
        -- "${SERVER_LAUNCHER_PATH}" --server-process ||
        fail "MooViewサーバーをmacOSの起動サービスへ登録できませんでした。"

    print "起動確認中です。サーバー異常終了時は直ちにログを表示します。"
    wait_for_web
    wait_result="${?}"

    if (( wait_result != 0 )); then
        print_warning "標準出力ログ: ${stdout_log}"
        print_warning "エラーログ: ${stderr_log}"
        if [[ -s "${stdout_log}" ]]; then
            /usr/bin/tail -n 30 "${stdout_log}"
        fi
        if [[ -s "${stderr_log}" ]]; then
            /usr/bin/tail -n 30 "${stderr_log}"
        fi
        if (( wait_result == 2 )); then
            fail "MooViewサーバーが起動途中で終了しました。"
        fi
        fail "MooViewサーバーを起動しましたが、${APP_BASE_URL} が90秒以内に応答しませんでした。"
    fi

    print_success "MooView Web: 正常（${APP_BASE_URL}）"
    print_success "ログ保存先: ${LOG_ROOT}"
}

function main() {
    if [[ "${1:-}" == "--server-process" ]]; then
        run_server_process
        return
    fi

    run_preflight_check

    if [[ "${1:-}" == "--check" ]]; then
        print ""
        print_success "起動前確認が完了しました。ファイルやプロセスは変更していません。"
        return 0
    fi

    start_opend_if_available
    ensure_python_runtime
    ensure_node_runtime
    sync_mac_runtime_source
    start_mooview_server

    print_step "ブラウザでMooViewを開きます。"
    /usr/bin/open "${APP_BASE_URL}/?launcher=$(/bin/date +%s)" ||
        print_warning "ブラウザを自動で開けませんでした。${APP_BASE_URL} を手動で開いてください。"

    print ""
    print_success "MooViewの起動が完了しました。"
}

main "${@}"
