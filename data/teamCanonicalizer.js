/**
 * Systematic Team Name & Suffix Canonicalizer
 * Resolves club acronyms, prefixes, repetitions, and trailing state indicators
 * ensuring 100% deterministic cross-league & tournament deduplication.
 */

function buildClubAliasesMap(clubMappings) {
    const map = {};
    for (const [officialName, aliases] of Object.entries(clubMappings || {})) {
        const all = new Set([officialName, ...(aliases || [])]);
        map[officialName] = Array.from(all).sort((a, b) => b.length - a.length);
    }
    return map;
}

function getTeamSuffix(teamName, clubName, clubAliasesMap) {
    if (!teamName) return '';
    let suffix = teamName.trim();

    // 1. Remove trailing state codes (OH), (KY), (IN), etc.
    suffix = suffix.trim().replace(/\([A-Z]{2}\)$/i, '').trim();

    const aliases = (clubAliasesMap && clubAliasesMap[clubName]) || (clubName ? [clubName] : []);
    
    // 2. Iteratively strip known club aliases and common club descriptors from the beginning
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 6) {
        changed = false;
        iterations++;
        
        for (const alias of aliases) {
            const regex = new RegExp('^\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*', 'i');
            if (regex.test(suffix)) {
                suffix = suffix.replace(regex, '').trim();
                changed = true;
                break;
            }
        }
        
        const genericRegex = /^(?:Soccer Club|Futbol Club|Youth Soccer|Soccer Association|Athletic Club|Premier Soccer|FC|SC|SA|Club|Academy)\b\s*/i;
        if (genericRegex.test(suffix)) {
            suffix = suffix.replace(genericRegex, '').trim();
            changed = true;
        }
    }

    return suffix.trim();
}

function getCanonicalTeamName(teamName, clubName, clubAliasesMap) {
    if (!teamName) return '';
    let sanitized = teamName.trim().replace(/\([A-Z]{2}\)$/i, '').trim();
    
    // Remove repeated words at start
    sanitized = sanitized.replace(/^(\b[\w\s]{2,25}?\b)\s+\1\b/i, '$1');
    sanitized = sanitized.replace(/^(\b[\w\s]{2,25}?\b)\s+\1\b/i, '$1');

    if (!clubName || clubName === 'Independent') return sanitized;

    const suffix = getTeamSuffix(sanitized, clubName, clubAliasesMap);
    if (!suffix) return sanitized;

    return `${clubName} ${suffix}`.trim();
}

function getNormalizedTeamKey(teamName, clubName, clubAliasesMap) {
    const suffix = getTeamSuffix(teamName, clubName, clubAliasesMap);
    const normSuffix = suffix.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const normClub = (clubName || 'independent').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    return `${normClub}|${normSuffix}`;
}

module.exports = {
    buildClubAliasesMap,
    getTeamSuffix,
    getCanonicalTeamName,
    getNormalizedTeamKey
};
