uniform sampler2D loc;
uniform sampler2D color;
uniform float point_size;

varying vec4 vColor;

void main() {
    vec3 position = texture2D(loc, uv.xy).xyz;
    vec4 color = texture2D(color, uv.xy).rgba;

    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    vec4 projectedPosition = projectionMatrix * viewPosition;

    vColor = color;
    gl_Position = projectedPosition;
    gl_PointSize = point_size;
}