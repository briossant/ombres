// Chunk `oklab` : conversions RGB linéaire <-> OKLab (mêmes matrices que oklab.ts).
export const oklab = /* glsl */ `
#ifndef NPR_CHUNK_OKLAB
#define NPR_CHUNK_OKLAB
vec3 lin2oklab(vec3 c){
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
vec3 oklab2lin(vec3 c){
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480) * c;
  lms = lms * lms * lms;
  return max(mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010) * lms, vec3(0.0));
}
vec3 mixLab(vec3 a, vec3 b, float t){ return oklab2lin(mix(lin2oklab(a), lin2oklab(b), t)); }
#endif
`
