import { serve } from "bun";
import { parseHTML } from "linkedom";
import ical, { ICalCalendarMethod } from "ical-generator";
import { DateTime, type WeekdayNumbers } from "luxon";

const days = [
  "poniedziałek",
  "wtorek",
  "środa",
  "czwartek",
  "piątek",
  "sobota",
  "niedziela",
];

function getDateForWeekday(weekdayIndex: number) {
  return DateTime.now()
    .setZone("Europe/Warsaw")
    .set({ weekday: (weekdayIndex + 1) as WeekdayNumbers });
}

async function fetchDegraHTML(searchParams: URLSearchParams) {
  const degraURL = new URL("https://degra.wi.pb.edu.pl/rozklady/rozklad.php");

  for (const [key, value] of searchParams.entries()) {
    degraURL.searchParams.set(key, value);
  }

  const degraResponse = await fetch(degraURL.toString());
  return await degraResponse.text();
}

function getStartEndDate(dayIndex: number, text: string) {
  const timeRegex = /(\d{1,2}):(\d{2})\s?-\s?(\d{1,2}):(\d{2})/;
  const timeMatch = text.match(timeRegex);

  const [_, startHours, startMinutes, endHours, endMinutes] = timeMatch ?? [];

  const startTime = getDateForWeekday(dayIndex).set({
    hour: parseInt(startHours),
    minute: parseInt(startMinutes),
  });

  const endTime = getDateForWeekday(dayIndex).set({
    hour: parseInt(endHours),
    minute: parseInt(endMinutes),
  });

  return [startTime, endTime];
}

const server = serve({
  routes: {
    "/schedule": {
      async GET(req) {
        const url = new URL(req.url);

        const degraHTML = await fetchDegraHTML(url.searchParams);

        const { document } = parseHTML(degraHTML);

        const planList = Array.from(document.querySelectorAll("section>ul")).at(
          -1,
        );
        if (!planList) return new Response(null, { status: 500 });

        const calendar = ical({ name: "Degra" });
        calendar.method(ICalCalendarMethod.REQUEST);

        for (const planDay of Array.from(planList.children)) {
          const dayName = planDay.childNodes[0].textContent?.trim();

          if (!dayName) continue;
          const dayIndex = days.indexOf(dayName);

          const innerList = planDay.children[0];

          for (const scheduledClass of Array.from(innerList.children)) {
            const text = scheduledClass.textContent?.trim();
            if (!text) continue;

            let [startTime, endTime] = getStartEndDate(dayIndex, text);

            const teacherRoomRegex = /prowadzący (.*) w sali ([a-zA-Z0-9/ ]*),/;
            const teacherRoomMatch = text.match(teacherRoomRegex);
            let [__, teacherName, room] = teacherRoomMatch ?? [];
            teacherName = teacherName.trim();

            const classNameRegex = /z (.*), prowadzący/;
            const classNameMatch = text.match(classNameRegex);
            const [___, className] = classNameMatch ?? [];
            const isOnlyNonEvenWeek = text.includes("(tyg. I)");
            const isOnlyEvenWeek = text.includes("(tyg. II)");
            let organizer = null;

            // only analyze names that have two+ words
            if (teacherName && teacherName.includes(" ")) {
              // we'll try to guess the email based on the teacher's name
              const hourNameRegex = /(\d{1,2}):(\d{2})\s-\s(\d{1,2}):(\d{2})/;

              if (hourNameRegex.test(teacherName)) {
                // This is a special case where it reads the time of it as the teacher's name
                [startTime, endTime] = getStartEndDate(dayIndex, teacherName);
              } else {
                const teacherNameRegex = /(\p{Lu})[\p{L}\.]*\s+(\p{L}+)/u;
                const teacherNameMatch = teacherName.match(teacherNameRegex);
                const [____, nameLetter, lastNameFirstSection] =
                  teacherNameMatch ?? [];

                const email = `${nameLetter.toLowerCase()}.${lastNameFirstSection
                  .toLowerCase()
                  // get rid of diacritics
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")}@pb.edu.pl`;

                organizer = {
                  name: teacherName,
                  email,
                };
              }
            }

            for (let weekOffset = 0; weekOffset <= 4; weekOffset++) {
              if (weekOffset > 0) {
                startTime = startTime.plus({ weeks: 1 });
                endTime = endTime.plus({ weeks: 1 });
              }

              const weekEven = startTime.weekNumber % 2 == 1;

              if (isOnlyNonEvenWeek && weekEven) continue;
              if (isOnlyEvenWeek && !weekEven) continue;

              calendar.createEvent({
                start: startTime.toJSDate(),
                end: endTime.toJSDate(),
                summary: className,
                location: room,
                description: text,
                organizer,
              });
            }
          }
        }

        return new Response(calendar.toString(), {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": 'attachment; filename="degra.ics"',
          },
        });
      },
    },
  },
  development: process.env.NODE_ENV === "development",
  hostname: "0.0.0.0",
});

console.log(`Listening on ${server.url}`);
