/**
 * JSON Parser Service
 * Robustly parses AI responses that may contain markdown, malformed JSON, etc.
 */

class JsonParserService {
    /**
     * Parse JSON with repair attempts for common AI mistakes
     */
    parse<T>(content: string): T {
        let jsonContent = content.trim();

        // Remove markdown code blocks
        jsonContent = jsonContent.replace(/```(?:json)?\s*\n?/gi, '').replace(/```\s*\n?/g, '').trim();

        // Extract outermost JSON object/array
        const jsonMatch = jsonContent.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
            jsonContent = jsonMatch[0];
        }

        // Attempt direct parse
        try {
            return JSON.parse(jsonContent) as T;
        } catch { /* continue to repair */ }

        // Repair: malformed keys like `" "steps"` → `"steps"`
        jsonContent = jsonContent.replace(/"\s*"\s*(\w+)"\s*:/g, '"$1":');

        // Repair: trailing commas
        jsonContent = jsonContent.replace(/,\s*([}\]])/g, '$1');

        // Repair: unquoted keys
        jsonContent = jsonContent.replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":');

        try {
            return JSON.parse(jsonContent) as T;
        } catch { /* continue */ }

        // Last resort: find first valid JSON object
        const braceMatch = jsonContent.match(/\{[\s\S]*\}/);
        if (braceMatch) {
            let candidate = braceMatch[0]
                .replace(/,\s*([}\]])/g, '$1')
                .replace(/"\s*"\s*(\w+)"\s*:/g, '"$1":');
            return JSON.parse(candidate) as T;
        }

        throw new Error('No valid JSON found in response');
    }

    /**
     * Safe parse - returns default instead of throwing
     */
    parseSafe<T>(content: string, defaultValue: T): T {
        try {
            return this.parse<T>(content);
        } catch {
            return defaultValue;
        }
    }
}

export default new JsonParserService();

