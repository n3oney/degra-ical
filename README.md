# degra-ical

Small web server that converts the class schedule from [PB WI's Degra](https://degra.wi.pb.edu.pl) to iCalendar format.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

A web server will run on port 3000 (default, can be overriden with the `PORT` environment variable).

This page exposes one endpoint - `/schedule`. To use it, go to the [personalized schedule](https://degra.wi.pb.edu.pl/rozklady/rozklad.php?page=student) URL, fill out the form, submit it, and then replace `https://degra.wi.pb.edu.pl/rozklady/rozklad.php` in the URL with `<your_host>/schedule`. Leave the query parameters alone - they are passed to the Degra server. The response is an ICS file containing your schedule.

> [!NOTE]  
> This has only been tested on the first year of uni. Lesson types used later might not work properly - feel free to open an issue.
> It also doesn't take into account days that are free of studying.
