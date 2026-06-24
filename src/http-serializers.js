export function serializeAuditRun(run) {
  if (!run) return { found: false };
  const testResults = getTestResults(run);
  const finalResults = getFinalResults(run);
  const testSuccessful = testResults.successful || [];
  const finalSuccessful = finalResults.successful || [];
  const testFailed = testResults.failed || [];
  const finalFailed = finalResults.failed || [];
  return {
    found: true,
    run: {
      id: run.id,
      correlation_id: run.correlation_id || null,
      status: run.phase,
      mode: run.filters?.writeMode || "unknown",
      started_at: run.created_at || null,
      completed_at: run.updated_at || null,
      candidate_count: Array.isArray(run.candidates) ? run.candidates.length : 0,
      accepted_count: testSuccessful.length + finalSuccessful.length,
      rejected_count: countRejectedCandidates(run),
      error_count: testFailed.length + finalFailed.length
    }
  };
}

export function serializeRunCandidates(run, { page = 1, pageSize = 25 } = {}) {
  const candidates = Array.isArray(run?.candidates) ? run.candidates : [];
  const testResults = getTestResults(run);
  const finalResults = getFinalResults(run);
  const start = (page - 1) * pageSize;
  const pageItems = candidates.slice(start, start + pageSize);
  const successful = new Map([
    ...(testResults.successful || []),
    ...(finalResults.successful || [])
  ].map(item => [item.email, item]));
  const failed = new Map([
    ...(testResults.failed || []),
    ...(finalResults.failed || [])
  ].map(item => [item.email, item]));

  return {
    run: {
      id: run.id,
      correlation_id: run.correlation_id || null,
      status: run.phase
    },
    pagination: {
      page,
      page_size: pageSize,
      total: candidates.length
    },
    candidates: pageItems.map(candidate => {
      const success = successful.get(candidate.email);
      const failure = failed.get(candidate.email);
      return {
        contact_id: success?.contactId || candidate.apolloId || null,
        company_id: success?.companyId || null,
        name: [candidate.firstName, candidate.lastName].filter(Boolean).join(" ") || null,
        company: candidate.company?.name || null,
        title: candidate.title || null,
        email: candidate.email || null,
        linkedin_url: candidate.linkedin || null,
        icp_score: candidate.icpScore ?? null,
        contact_relevance_score: candidate.contactScore ?? null,
        status: failure ? "failed" : success ? "synced" : "candidate",
        reasons: buildCandidateReasons(candidate, failure),
        hubspot_sync_status: failure ? "failed" : success ? "synced" : "pending"
      };
    })
  };
}

function countRejectedCandidates(run) {
  return (getTestResults(run).failed || []).length + (getFinalResults(run).failed || []).length;
}

function getTestResults(run) {
  return run?.test_results || run?.testResults || {};
}

function getFinalResults(run) {
  return run?.final_results || run?.finalResults || {};
}

function buildCandidateReasons(candidate, failure) {
  const reasons = [];
  if (candidate.emailVerified) reasons.push("verified_email");
  if (candidate.company?.domain) reasons.push("company_domain_available");
  if (candidate.validPhones?.length) reasons.push("valid_phone_available");
  if (failure) reasons.push("sync_failed");
  return reasons;
}

export function serializeDiagnostic(provider, result, { enabled }) {
  if (!enabled) {
    return {
      diagnostic: {
        provider,
        status: "disabled",
        checked_at: new Date().toISOString()
      }
    };
  }
  return {
    diagnostic: {
      provider,
      status: result?.ok ? "ok" : "failed",
      checked_at: new Date().toISOString()
    }
  };
}
