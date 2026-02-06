/* tslint:disable */
/* eslint-disable */

/**
 * Generates a ThumbHash for an image and returns metadata (width, height, hash).
 * The image is automatically resized to a max dimension of 100px before hashing.
 * This is done to improve performance, as ThumbHash doesn't need high resolution.
 */
export function generate_thumbhash(input: Uint8Array): any;

/**
 * Resizes an image buffer to the specified dimensions.
 */
export function resize_image(input: Uint8Array, width: number, height: number): Uint8Array;
