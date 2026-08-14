const path = require('path');
const fs = require('fs');

/**
 * Normalizes a club name into its core root stem by stripping
 * generic sports/soccer suffixes, organizational qualifiers, and punctuation.
 */
function getClubStem(name) {
    if (!name) return '';
    let s = name.trim().toLowerCase();

    // 1. Expand / standardize regional shorthand
    s = s.replace(/\b(nky)\b/g, 'northern kentucky');
    s = s.replace(/\b(cincy)\b/g, 'cincinnati');
    s = s.replace(/\b(nw)\b/g, 'northwest');
    s = s.replace(/&/g, 'and');

    // 2. Remove punctuation
    s = s.replace(/['’`.\-\/\\#()]/g, ' ');

    // 3. Strip organizational suffixes & noise words (longest matches first)
    const noiseWords = [
        'youth soccer association',
        'youth soccer organization',
        'youth soccer club',
        'youth soccer',
        'soccer association',
        'soccer organization',
        'soccer club',
        'youth organization',
        'youth athletics',
        'athletic club',
        'football club',
        'futbol club',
        'sports club',
        'premier soccer club',
        'premier fc',
        'premier sc',
        'premier',
        'association',
        'organization',
        'athletics',
        'athletic',
        'youth',
        'soccer',
        'futbol',
        'football',
        'club',
        'sc',
        'fc',
        'sa',
        'ac',
        'yo',
        'county'
    ];

    for (const nw of noiseWords) {
        const re = new RegExp('\\b' + nw + '\\b', 'gi');
        s = s.replace(re, ' ');
    }

    s = s.replace(/\s+/g, ' ').trim();
    return s;
}

/**
 * Deterministically picks the most formal and descriptive title
 * from an array of club name variants belonging to the same cluster.
 */
function pickCanonicalName(variants) {
    if (!variants || variants.length === 0) return 'Independent';
    if (variants.length === 1) return variants[0];

    const scoreName = (name) => {
        let score = name.length;
        // Prefer formal designations like "Soccer Club", "SC", "FC", "Association", "Youth Athletics"
        if (/\b(Soccer Club|Soccer Association|Youth Athletics|Youth Organization|Athletic Club)\b/i.test(name)) score += 30;
        if (/\b(SC|FC|SA|AC)\b/i.test(name)) score += 20;
        if (/\b(Premier|United|Academy|Alliance)\b/i.test(name)) score += 15;
        // Penalize over-short names that lack context (e.g., "Oak Hills" vs "Oak Hills Youth Athletics")
        if (name.split(' ').length > 1) score += 10;
        return score;
    };

    return [...variants].sort((a, b) => scoreName(b) - scoreName(a))[0];
}

/**
 * Builds a comprehensive canonical dictionary combining:
 * 1. Explicit user mappings from club_mappings.json
 * 2. Automatic stem-based clustering across all discovered club names
 */
function buildCanonicalLookup(allDiscoveredClubs = [], explicitMappings = {}) {
    const canonicalLookup = {}; // Map: lowercase raw / alias -> canonicalName
    const stemToCanonical = {}; // Map: stem -> canonicalName
    const clusterMap = {};      // Map: stem -> Set of raw variants

    // 1. Ingest Explicit Mappings
    for (const [officialName, aliases] of Object.entries(explicitMappings)) {
        const stem = getClubStem(officialName);
        if (stem) {
            stemToCanonical[stem] = officialName;
        }

        canonicalLookup[officialName.toLowerCase()] = officialName;
        if (Array.isArray(aliases)) {
            aliases.forEach(alias => {
                if (alias) {
                    canonicalLookup[alias.toLowerCase()] = officialName;
                    const aliasStem = getClubStem(alias);
                    if (aliasStem && !stemToCanonical[aliasStem]) {
                        stemToCanonical[aliasStem] = officialName;
                    }
                }
            });
        }
    }

    // 2. Group all discovered clubs into stem clusters
    for (const rawName of allDiscoveredClubs) {
        if (!rawName || rawName === 'Independent') continue;
        const stem = getClubStem(rawName);
        if (!stem) continue;

        if (!clusterMap[stem]) clusterMap[stem] = new Set();
        clusterMap[stem].add(rawName.trim());
    }

    // 3. Resolve canonical name for each stem cluster
    for (const [stem, variantsSet] of Object.entries(clusterMap)) {
        const variants = Array.from(variantsSet);
        let canonical = stemToCanonical[stem];

        if (!canonical) {
            canonical = pickCanonicalName(variants);
            stemToCanonical[stem] = canonical;
        }

        // Map every variant in the cluster to the canonical name
        variants.forEach(variant => {
            canonicalLookup[variant.toLowerCase()] = canonical;
        });
    }

    return {
        canonicalLookup,
        stemToCanonical,
        getCanonical(name) {
            if (!name || name === 'Independent') return 'Independent';
            const trimmed = name.trim();
            const lower = trimmed.toLowerCase();

            // Direct match
            if (canonicalLookup[lower]) {
                return canonicalLookup[lower];
            }

            // Stem match
            const stem = getClubStem(trimmed);
            if (stem && stemToCanonical[stem]) {
                return stemToCanonical[stem];
            }

            return trimmed;
        }
    };
}

module.exports = {
    getClubStem,
    pickCanonicalName,
    buildCanonicalLookup
};
