---
title: Vercel AI SDK Integration - OpenRouter SDK Support
url: https://openrouter.ai/docs/guides/community/vercel-ai-sdk
hostname: openrouter.ai
description: Integrate OpenRouter using Vercel AI SDK. Complete guide for Vercel AI SDK integration with OpenRouter for Next.js applications.
sitename: OpenRouter | Documentation
date: "2026-08-08"
---
```
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { z } from 'zod';
export const getLasagnaRecipe = async (modelName: string) => {
  const openrouter = createOpenRouter({
    apiKey: '<OPENROUTER_API_KEY>',
  });
  const response = streamText({
    model: openrouter(modelName),
    prompt: 'Write a vegetarian lasagna recipe for 4 people.',
  });
  await response.consumeStream();
  return response.text;
};
export const getWeather = async (modelName: string) => {
  const openrouter = createOpenRouter({
    apiKey: '<OPENROUTER_API_KEY>',
  });
  const response = streamText({
    model: openrouter(modelName),
    prompt: 'What is the weather in San Francisco, CA in Fahrenheit?',
    tools: {
      getCurrentWeather: {
        description: 'Get the current weather in a given location',
        parameters: z.object({
          location: z
            .string()
            .describe('The city and state, e.g. San Francisco, CA'),
          unit: z.enum(['celsius', 'fahrenheit']).optional(),
        }),
        execute: async ({ location, unit = 'celsius' }) => {
          // Mock response for the weather
          const weatherData = {
            'Boston, MA': {
              celsius: '15°C',
              fahrenheit: '59°F',
            },
            'San Francisco, CA': {
              celsius: '18°C',
              fahrenheit: '64°F',
            },
          };
          const weather = weatherData[location];
          if (!weather) {
            return `Weather data for ${location} is not available.`;
          }
          return `The current weather in ${location} is ${weather[unit]}.`;
        },
      },
    },
  });
  await response.consumeStream();
  return response.text;
};
```
