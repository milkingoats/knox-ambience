// Knox Ambience bloom pyramid: shared downsample for knox_down8/16/32.frag. Halves the source with a
// 13-tap filter (a 4 x 4 box in the middle and four overlapping 3 x 3 boxes around it, weighted so the
// result doesn't flicker as small bright lights move between pixels). Each pass has its own file only
// because Viewpoint names a pass's sampler after its input.

vec4 knoxDown(sampler2D src, vec2 uv) {
    vec2 t = 1.0 / vec2(textureSize(src, 0));
    vec4 a = textureLod(src, uv + t * vec2(-2.0, 2.0), 0.0);
    vec4 b = textureLod(src, uv + t * vec2(0.0, 2.0), 0.0);
    vec4 c = textureLod(src, uv + t * vec2(2.0, 2.0), 0.0);
    vec4 d = textureLod(src, uv + t * vec2(-2.0, 0.0), 0.0);
    vec4 e = textureLod(src, uv, 0.0);
    vec4 f = textureLod(src, uv + t * vec2(2.0, 0.0), 0.0);
    vec4 g = textureLod(src, uv + t * vec2(-2.0, -2.0), 0.0);
    vec4 h = textureLod(src, uv + t * vec2(0.0, -2.0), 0.0);
    vec4 i = textureLod(src, uv + t * vec2(2.0, -2.0), 0.0);
    vec4 j = textureLod(src, uv + t * vec2(-1.0, 1.0), 0.0);
    vec4 k = textureLod(src, uv + t * vec2(1.0, 1.0), 0.0);
    vec4 l = textureLod(src, uv + t * vec2(-1.0, -1.0), 0.0);
    vec4 m = textureLod(src, uv + t * vec2(1.0, -1.0), 0.0);
    return e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
}
