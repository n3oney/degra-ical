import { serve } from "bun";
import { parseHTML } from "linkedom";
import ical, { ICalCalendarMethod } from "ical-generator";

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
  const date = new Date();
  const currentDay = date.getDay(); // sunday first

  const adjustedCurrentDay = currentDay === 0 ? 6 : currentDay - 1;

  date.setDate(date.getDate() - adjustedCurrentDay + weekdayIndex);

  return date;
}

// source: https://weeknumber.com/how-to/javascript
function getWeek(originalDate: Date) {
  const date = new Date(originalDate);
  date.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  // January 4 is always in week 1.
  var week1 = new Date(date.getFullYear(), 0, 4);
  // Adjust to Thursday in week 1 and count number of weeks from date to week1.
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    )
  );
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
  const timeRegex = /godz\. (\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/;
  const timeMatch = text.match(timeRegex);

  const [_, startHours, startMinutes, endHours, endMinutes] = timeMatch ?? [];

  const startTime = getDateForWeekday(dayIndex);
  startTime.setHours(parseInt(startHours), parseInt(startMinutes));

  const endTime = getDateForWeekday(dayIndex);
  endTime.setHours(parseInt(endHours), parseInt(endMinutes));

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
          -1
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

            const teacherRoomRegex = /prowadzący (.*) w sali ([a-zA-Z0-9]*),/;
            const teacherRoomMatch = text.match(teacherRoomRegex);
            const [__, teacherName, room] = teacherRoomMatch ?? [];

            const classNameRegex = /z (.*), prowadzący/;
            const classNameMatch = text.match(classNameRegex);
            const [___, className] = classNameMatch ?? [];
            const isOnlyNonEvenWeek = text.includes("(tyg. I)");
            const isOnlyEvenWeek = text.includes("(tyg. II)");

            let organizer = null;

            if (teacherName) {
              // we'll try to guess the email based on the teacher's name
              const teacherNameRegex = /(\p{Lu})\p{L}*\s+(\p{L}+)/u;
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

            for (let weekOffset = 0; weekOffset <= 4; weekOffset++) {
              if (weekOffset > 0) {
                startTime = new Date(startTime);
                startTime.setDate(startTime.getDate() + 7);
                endTime = new Date(endTime);
                endTime.setDate(endTime.getDate() + 7);
              }

              const weekEven = getWeek(startTime) % 2 == 0;

              if (isOnlyNonEvenWeek && weekEven) continue;
              if (isOnlyEvenWeek && !weekEven) continue;

              calendar.createEvent({
                start: startTime,
                end: endTime,
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
