//! WASM модуль для обработки изображений (docs/IMAGE_CACHE_IMPLEMENTATION_PLAN.md, Фаза 2).
//! Ресайз через crate `image` (PNG/JPEG/GIF).

use image::{imageops::FilterType, ImageOutputFormat};
use std::io::Cursor;
use wasm_bindgen::prelude::*;

/// Определяет формат по magic bytes для выбора энкодера.
fn output_format_from_magic(input: &[u8]) -> ImageOutputFormat {
    if input.len() >= 8 && input[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        ImageOutputFormat::Png
    } else if input.len() >= 3 && input[0..3] == [0xFF, 0xD8, 0xFF] {
        ImageOutputFormat::Jpeg(85)
    } else if input.len() >= 6 && (input[0..6] == b"GIF87a"[..] || input[0..6] == b"GIF89a"[..]) {
        ImageOutputFormat::Gif
    } else {
        ImageOutputFormat::Png
    }
}

/// Декодирует изображение, изменяет размер и кодирует обратно в том же формате.
/// При ошибке (неизвестный формат, повреждённые данные) возвращает входной буфер (fallback).
#[wasm_bindgen]
pub fn resize_image(input: &[u8], width: u32, height: u32) -> Vec<u8> {
    if width == 0 || height == 0 {
        return input.to_vec();
    }
    let img = match image::load_from_memory(input) {
        Ok(im) => im,
        Err(_) => return input.to_vec(),
    };
    let resized = img.resize_exact(width, height, FilterType::Lanczos3);
    let format = output_format_from_magic(input);
    let mut out = Vec::new();
    let mut cursor = Cursor::new(&mut out);
    if resized
        .write_to(&mut cursor, format)
        .is_err()
    {
        return input.to_vec();
    }
    out
}
