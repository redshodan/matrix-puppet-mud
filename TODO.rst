* handle whispers
* handle pages
- handle name changes. track in mudclient state. send room nicks
- two messages right after each other seem to get reverse ordered. Like a say
  and a trigger
- globals @fo's not being matched right
- speaking/posing on direct MUX connection not being shown in bridge. You say matching is killing it
- handle edited messages
- handle replies
* handle multi-line messages matrix->mud
- double hit on triggers when non-mainuser triggered.
* filter Fazool saying bit.ly urls
- triggered says don't have dbnum, so shows up as mud_baron user.
- config file to spec extra filters/regexs. like for faz url shortening
