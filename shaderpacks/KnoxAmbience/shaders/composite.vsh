#version 330 compatibility

// Full-screen pass. The fragment shaders read pixels by gl_FragCoord, so no texture coordinates
// are passed: Viewpoint doesn't fill gl_TextureMatrix for these passes, which made every pixel
// read the same corner texel (a flat blue sky colour over the whole screen).

void main() {
    gl_Position = ftransform();
}
