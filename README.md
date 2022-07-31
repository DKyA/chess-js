# Chess board + custom enemy algorithm
I will properly update this as it gets done.
Few lines of documentation now, I am fairly sure however that this will get obsolete quite quickly. Today is 3172022/1200.
## Status as of today:
- We have a basic Al bot, that does some stuff. It is capable of beating Chess.com 700 rated bot. I haven't tested beyond, it is likely that it can do up to a 1000.
- Currently working on testing and bugfix
- Looking to implement quite optimised system of recursive evaluation, so that the algorithm can look into the future. Idea is to take 3 of my best moves and pre-simulate more turns for them.
- Also a thing that I need to do and think (foolish) will be simple is taking in account enemy position, subtracting it from current score. It is nice that I take a queen, if it hangs mate in 1.
## File structure
- HTML for promotion and basic board
- App.js for engine
- Styles for style AND tile hitboxes
## `App.js` structure
- Can feel overwhelming, I know.
- Main classes include Board, Mover, Pieces and Al.
### Board
- Main driver and 
