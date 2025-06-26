// This is an AI-powered function that optimizes watermark placement on an image.
'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const OptimizeWatermarkPlacementInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo to place a watermark on, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  watermarkDataUri: z
    .string()
    .describe(
      "A watermark image, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type OptimizeWatermarkPlacementInput = z.infer<typeof OptimizeWatermarkPlacementInputSchema>;

const OptimizeWatermarkPlacementOutputSchema = z.object({
  x: z.number().describe('The optimal x coordinate for the watermark placement.'),
  y: z.number().describe('The optimal y coordinate for the watermark placement.'),
  scale: z.number().describe('The optimal scale factor for the watermark.'),
});
export type OptimizeWatermarkPlacementOutput = z.infer<typeof OptimizeWatermarkPlacementOutputSchema>;

export async function optimizeWatermarkPlacement(
  input: OptimizeWatermarkPlacementInput
): Promise<OptimizeWatermarkPlacementOutput> {
  return optimizeWatermarkPlacementFlow(input);
}

const prompt = ai.definePrompt({
  name: 'optimizeWatermarkPlacementPrompt',
  input: {schema: OptimizeWatermarkPlacementInputSchema},
  output: {schema: OptimizeWatermarkPlacementOutputSchema},
  prompt: `You are an AI expert in image analysis and aesthetic composition. Your task is to determine the optimal placement for a watermark on a given image.

  Analyze the image and the watermark provided. Consider factors such as:
  - Important details in the image that should not be obscured.
  - Areas of the image that are visually less important or contain negative space.
  - The size and shape of the watermark.
  - The overall composition and balance of the image.

  Based on your analysis, determine the ideal x and y coordinates (as a percentage of image width and height, respectively), and a scale factor for the watermark to ensure it is unobtrusive yet clearly visible. All values should be returned as floating point numbers between 0 and 1.

  Image: {{media url=photoDataUri}}
  Watermark: {{media url=watermarkDataUri}}`,
});

const optimizeWatermarkPlacementFlow = ai.defineFlow(
  {
    name: 'optimizeWatermarkPlacementFlow',
    inputSchema: OptimizeWatermarkPlacementInputSchema,
    outputSchema: OptimizeWatermarkPlacementOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
