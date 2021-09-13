# Block Duplicate Work Items
This extension provides the ability to block duplicate work item creation, similarity between work items is currently determined based on [Dice's Coefficient](http://en.wikipedia.org/wiki/S%C3%B8rensen%E2%80%93Dice_coefficient).

Checks are automatically performed based on the following fields :
- Title
- Description

Similarity is established based on an index 0.0 - 1.0 :
- 0.0 being least similar
- 1.0 being most similar.

By default this extension leverages a similarity index of 0.8.

This extension can be leveraged in combination with the [Find similar workitems](https://marketplace.visualstudio.com/items?itemName=tschmiedlechner.find-similar-workitems) extension to establish which work items are similar to the current item.