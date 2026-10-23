/**
 * Redis Lua script for Atomic Sliding-Window Rate Limiting
 *
 * KEYS[1]: Rate limit sorted set key
 * ARGV[1]: Current epoch timestamp in milliseconds (now)
 * ARGV[2]: Sliding window duration in milliseconds (windowMs)
 * ARGV[3]: Maximum allowed requests within the window (maxRequests)
 * ARGV[4]: Unique member identifier for the current request
 *
 * Returns an array:
 * [0] allowed (1 = allowed, 0 = blocked)
 * [1] remaining requests count
 * [2] retryAfterSeconds (0 if allowed, otherwise seconds until oldest request expires)
 * [3] resetTimeSeconds (unix epoch seconds when the rate limit window will reset)
 * [4] current active request count
 */
export const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local maxRequests = tonumber(ARGV[3])
local memberId = ARGV[4]

local clearBefore = now - windowMs
redis.call('ZREMRANGEBYSCORE', key, '-inf', clearBefore)

local currentCount = redis.call('ZCARD', key)

if currentCount < maxRequests then
    redis.call('ZADD', key, now, memberId)
    redis.call('PEXPIRE', key, windowMs)
    
    local remaining = maxRequests - currentCount - 1
    local resetTimeSeconds = math.ceil((now + windowMs) / 1000)
    
    return { 1, remaining, 0, resetTimeSeconds, currentCount + 1 }
else
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local oldestScore = now - windowMs
    if #oldest >= 2 then
        oldestScore = tonumber(oldest[2])
    end
    
    local expiresAtMs = oldestScore + windowMs
    local retryAfterMs = math.max(1, expiresAtMs - now)
    local retryAfterSeconds = math.ceil(retryAfterMs / 1000)
    local resetTimeSeconds = math.ceil(expiresAtMs / 1000)
    
    return { 0, 0, retryAfterSeconds, resetTimeSeconds, currentCount }
end
`;
