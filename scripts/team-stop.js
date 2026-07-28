#!/usr/bin/env node
/**
 * team-stop.js - Team Mode Stop Handler (v1.5.1)
 *
 * Team coordinator 종료 시 리소스 정리:
 * 1. PDCA 상태 업데이트 (team mode 종료 기록)
 * 2. bkit-memory.json에 team 세션 정보 저장
 * 3. Team 정리 안내 메시지 출력
 */

const { outputAllow, hasInFlightBackgroundWork } = require('../lib/core/io');
const { debugLog } = require('../lib/core/debug');
const { getPdcaStatusFull, addPdcaHistory } = require('../lib/pdca/status');

function run(context) {
  debugLog('TeamStop', 'Team cleanup started');

  const pdcaStatus = getPdcaStatusFull();
  const feature = pdcaStatus?.primaryFeature;

  if (feature) {
    addPdcaHistory({
      action: 'team_session_ended',
      feature: feature,
      phase: pdcaStatus?.features?.[feature]?.phase
    });
  }

  // State writer: agent state cleanup (v1.5.3 Team Visibility)
  //
  // ENH-374: skipped while background work is still registered — teammates
  // spawned during the team session can outlive the coordinator's own turn on
  // CC v2.1.218+ (background subagents) and v2.1.219+ (nested spawn by default).
  try {
    const teamModule = require('../lib/team');
    if (teamModule.cleanupAgentState) {
      if (hasInFlightBackgroundWork(context)) {
        debugLog('TeamStop', 'Agent state cleanup deferred (background work in flight)', {
          backgroundTaskCount: context.background_tasks.length,
        });
      } else {
        teamModule.cleanupAgentState();
      }
    }
  } catch (e) {
    debugLog('TeamStop', 'Agent state cleanup failed (non-fatal)', { error: e.message });
  }

  outputAllow('Team session ended. Returning to single-session mode.', 'Stop');
  debugLog('TeamStop', 'Team cleanup completed');
}

module.exports = { run };
