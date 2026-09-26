// Chunk `mrt` : 2e sortie de la passe G-buffer (normale de vue + ID d'objet).
// OBLIGATOIRE dans tout matériau dessiné dans la scène principale : sans cette
// sortie, ANGLE lève GL_INVALID_OPERATION et l'objet disparaît (NPR §2).
// Transparents : écrire gNormalId = vec4(0.0) (alpha 0 -> normale/ID du dessous intacts).
export const mrt = /* glsl */ `
#ifndef NPR_CHUNK_MRT
#define NPR_CHUNK_MRT
layout(location = 1) out highp vec4 gNormalId;
void writeGBuffer(vec3 viewNormal, float objId){ gNormalId = vec4(normalize(viewNormal) * 0.5 + 0.5, objId / 255.0); }
#endif
`
