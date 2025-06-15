/**
 * 자동 Git Pull 스크립트
 * 30초마다 자동으로 git pull을 실행하여 코드를 최신 상태로 유지합니다
 *
 * @fileoverview 개발 환경에서 자동 배포를 위한 Git Pull 자동화 스크립트
 * @warning 이 스크립트는 개발 환경용이며, 프로덕션에서는 사용을 권장하지 않습니다
 */
import { exec } from "node:child_process";

/**
 * 타임스탬프와 함께 로그를 출력하는 헬퍼 함수
 *
 * @param {string} message - 출력할 로그 메시지
 * @param {string} [level='INFO'] - 로그 레벨 (INFO, WARN, ERROR)
 * @example
 * logWithTimestamp('자동 pull 시작', 'INFO');
 */
const logWithTimestamp = (message, level = "INFO") => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level}] ${message}`);
};

/**
 * Git Pull 명령을 실행하고 결과를 로그에 기록하는 함수
 * 성공, 실패, 경고 상황을 모두 처리하고 적절한 로그를 출력합니다
 *
 * @async
 * @function executeGitPull
 * @returns {void}
 * @example
 * // 직접 호출
 * executeGitPull();
 */
const executeGitPull = () => {
  exec("git pull", (error, stdout, stderr) => {
    if (error) {
      logWithTimestamp(`자동 pull 실패: ${error.message}`, "ERROR");
      return;
    }
    if (stderr) {
      logWithTimestamp(`자동 pull 경고: ${stderr}`, "WARN");
    }
    const result = stdout.trim() || "No changes";
    logWithTimestamp(`자동 pull 상태: ${result}`);
  });
};

/**
 * 자동 Pull 서비스 시작
 * 30초(30,000ms) 간격으로 git pull을 반복 실행합니다
 *
 * @constant {number} PULL_INTERVAL - Pull 실행 간격 (밀리초)
 */
const PULL_INTERVAL = 10000; // 10초

setInterval(executeGitPull, PULL_INTERVAL);
logWithTimestamp(
  "자동 pull 서비스가 시작되었습니다. 10초마다 git pull을 실행합니다.",
);

/**
 * 미래 확장을 위한 내보내기
 * 다른 모듈에서 이 스크립트의 기능을 사용할 수 있도록 합니다
 *
 * @exports executeGitPull - 단일 Git Pull 실행 함수
 * @exports logWithTimestamp - 타임스탬프 로그 함수
 */
export { executeGitPull, logWithTimestamp };