import { describe, expect, it } from 'vitest';
import { CityAudio, resolveWeatherMood, weatherAudioProfile, type WeatherMood } from '../engine/audio';

describe('weather ambient music profiles', () => {
  it('maps each weather state and night sky to its dedicated musical mood', () => {
    expect(resolveWeatherMood(0, 0.1, 0, false, 0)).toBe('clear');
    expect(resolveWeatherMood(0, 0.1, 0, false, 0.8)).toBe('night');
    expect(resolveWeatherMood(0, 0.85, 0.08, false, 0)).toBe('cloudy');
    expect(resolveWeatherMood(0, 0.4, 0.62, false, 0)).toBe('haze');
    expect(resolveWeatherMood(0.35, 0.75, 0.1, false, 0)).toBe('drizzle');
    expect(resolveWeatherMood(0.75, 0.9, 0.18, false, 0)).toBe('rain');
    expect(resolveWeatherMood(0.95, 0.98, 0.25, true, 0)).toBe('storm');
  });

  it('gives each weather mood distinct musical scale, pad chord, tempo, and wind profile', () => {
    const moods: [WeatherMood, Parameters<typeof weatherAudioProfile>][] = [
      ['clear', [0, 0.1, 0, false, 0]],
      ['night', [0, 0.1, 0, false, 0.9]],
      ['cloudy', [0, 0.85, 0.08, false, 0]],
      ['haze', [0, 0.5, 0.6, false, 0]],
      ['drizzle', [0.35, 0.75, 0.1, false, 0]],
      ['rain', [0.78, 0.9, 0.18, false, 0]],
      ['storm', [1, 0.98, 0.28, true, 0]],
    ];
    const labels = new Set<string>();
    for (const [expected, args] of moods) {
      const p = weatherAudioProfile(...args);
      expect(p.mood).toBe(expected);
      expect(p.scale.length).toBeGreaterThanOrEqual(7);
      expect(p.pattern.length).toBeGreaterThanOrEqual(8);
      expect(p.stepSec).toBeGreaterThan(0.25);
      labels.add(p.label);
    }
    expect(labels.size).toBe(moods.length);
  });

  it('updates CityAudio active mood safely without browser AudioContext', () => {
    const audio = new CityAudio();
    audio.on = true;
    audio.update(0.1, 1.5, 0.4, 1, 0.8, false, { clouds: 0.9, haze: 0.2, storm: false, windX: 0.6, night: 0.2 });
    expect(audio.currentMood).toBe('rain');
    expect(audio.moodLabel).toBe('Monsoon Lo-Fi Drops');

    audio.update(0.1, 1.5, 0.4, 1, 0.7, false, { rainTarget: 0, clouds: 0.2, haze: 0.55, storm: false, windX: 0.2, night: 0 });
    expect(audio.currentMood).toBe('haze');
    expect(audio.moodLabel).toBe('Misty Deccan Morning');
  });
});
